// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

interface IBalancerVault {
    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

contract ArbitrageBot {
    address public owner;
    mapping(address => bool) public authorizedBots;
    bool private locked;
    
    // Base network addresses
    IBalancerVault public constant BALANCER_VAULT = IBalancerVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    address public constant UNISWAP_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public constant SUSHISWAP_ROUTER = 0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891;
    address public constant BASESWAP_ROUTER = 0x327Df1E6de05895d2ab08513aaDD9313Fe505d86;
    
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant WBTC = 0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA;
    
    struct ArbitrageParams {
        address tokenA;
        address tokenB;
        uint256 amountIn;
        address buyDex;
        address sellDex;
        uint256 minProfit;
    }
    
    event ArbitrageExecuted(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountIn,
        uint256 profit
    );
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedBots[msg.sender], "Not authorized");
        _;
    }
    
    modifier noReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }
    
    constructor() {
        owner = msg.sender;
        authorizedBots[msg.sender] = true;
    }
    
    function authorizeBot(address bot) external onlyOwner {
        authorizedBots[bot] = true;
    }
    
    function executeArbitrage(ArbitrageParams calldata params) 
        external 
        onlyAuthorized 
        noReentrant 
    {
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        
        tokens[0] = params.tokenA;
        amounts[0] = params.amountIn;
        
        bytes memory userData = abi.encode(params);
        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, userData);
    }
    
    function receiveFlashLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external {
        require(msg.sender == address(BALANCER_VAULT), "Only Balancer");
        
        ArbitrageParams memory params = abi.decode(userData, (ArbitrageParams));
        uint256 initialBalance = IERC20(tokens[0]).balanceOf(address(this));
        
        // Buy on cheaper DEX
        _executeTrade(params.tokenA, params.tokenB, amounts[0], params.buyDex);
        uint256 tokenBReceived = IERC20(params.tokenB).balanceOf(address(this));
        
        // Sell on expensive DEX
        _executeTrade(params.tokenB, params.tokenA, tokenBReceived, params.sellDex);
        
        uint256 finalBalance = IERC20(tokens[0]).balanceOf(address(this));
        uint256 profit = finalBalance - initialBalance;
        
        require(profit >= params.minProfit, "Insufficient profit");
        
        // Repay flashloan
        uint256 repayAmount = amounts[0] + feeAmounts[0];
        IERC20(tokens[0]).transfer(address(BALANCER_VAULT), repayAmount);
        
        emit ArbitrageExecuted(params.tokenA, params.tokenB, amounts[0], profit);
    }
    
    function _executeTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address dexRouter
    ) internal {
        IERC20(tokenIn).approve(dexRouter, amountIn);
        
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        IUniswapV2Router(dexRouter).swapExactTokensForTokens(
            amountIn,
            0,
            path,
            address(this),
            block.timestamp + 300
        );
    }
    
    function estimateProfit(ArbitrageParams calldata params) 
        external 
        view 
        returns (uint256) 
    {
        address[] memory path = new address[](2);
        
        // Get buy price
        path[0] = params.tokenA;
        path[1] = params.tokenB;
        uint256[] memory buyAmounts = IUniswapV2Router(params.buyDex).getAmountsOut(params.amountIn, path);
        
        // Get sell price
        path[0] = params.tokenB;
        path[1] = params.tokenA;
        uint256[] memory sellAmounts = IUniswapV2Router(params.sellDex).getAmountsOut(buyAmounts[1], path);
        
        return sellAmounts[1] > params.amountIn ? sellAmounts[1] - params.amountIn : 0;
    }
    
    function withdraw(address token) external onlyOwner {
        if (token == address(0)) {
            payable(owner).transfer(address(this).balance);
        } else {
            IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
        }
    }
    
    receive() external payable {}
}