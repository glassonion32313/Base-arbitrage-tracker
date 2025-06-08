import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { db } from './db';
import { userAccounts, userSessions, type UserAccount, type InsertUserAccount, type InsertUserSession } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-encryption-key';
const SALT_ROUNDS = 12;

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  privateKey?: string;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  walletAddress: string | null;
  hasPrivateKey: boolean;
}

export class AuthService {
  // Register new user
  async register(data: RegisterData): Promise<{ user: AuthenticatedUser; token: string }> {
    const { username, email, password, privateKey } = data;

    // Check if user already exists
    const existingUser = await db.select()
      .from(userAccounts)
      .where(eq(userAccounts.username, username))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('Username already exists');
    }

    const existingEmail = await db.select()
      .from(userAccounts)
      .where(eq(userAccounts.email, email))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new Error('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let walletAddress: string | null = null;
    let privateKeyEncrypted: string | null = null;

    // If private key provided, validate and encrypt it
    if (privateKey) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        walletAddress = wallet.address;
        privateKeyEncrypted = this.encryptPrivateKey(privateKey);
      } catch (error) {
        throw new Error('Invalid private key format');
      }
    }

    // Create user account
    const [newUser] = await db.insert(userAccounts).values({
      username,
      email,
      passwordHash,
      privateKeyEncrypted,
      walletAddress,
    }).returning();

    // Generate JWT token
    const token = this.generateToken(newUser.id);

    // Create session
    await this.createSession(newUser.id, token);

    return {
      user: this.formatUser(newUser),
      token
    };
  }

  // Login user
  async login(credentials: LoginCredentials): Promise<{ user: AuthenticatedUser; token: string }> {
    const { username, password } = credentials;

    // Find user by username
    const [user] = await db.select()
      .from(userAccounts)
      .where(and(
        eq(userAccounts.username, username),
        eq(userAccounts.isActive, true)
      ))
      .limit(1);

    if (!user) {
      throw new Error('Invalid username or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid username or password');
    }

    // Update last login
    await db.update(userAccounts)
      .set({ lastLoginAt: new Date() })
      .where(eq(userAccounts.id, user.id));

    // Generate JWT token
    const token = this.generateToken(user.id);

    // Create session
    await this.createSession(user.id, token);

    return {
      user: this.formatUser(user),
      token
    };
  }

  // Add or update private key for existing user
  async updatePrivateKey(userId: number, privateKey: string): Promise<string> {
    try {
      // Validate private key
      const wallet = new ethers.Wallet(privateKey);
      const walletAddress = wallet.address;

      // Encrypt private key
      const privateKeyEncrypted = this.encryptPrivateKey(privateKey);

      // Update user record
      await db.update(userAccounts)
        .set({ 
          privateKeyEncrypted,
          walletAddress,
          updatedAt: new Date()
        })
        .where(eq(userAccounts.id, userId));

      return walletAddress;
    } catch (error) {
      throw new Error('Invalid private key format');
    }
  }

  // Get user's decrypted private key
  async getPrivateKey(userId: number): Promise<string> {
    const [user] = await db.select()
      .from(userAccounts)
      .where(eq(userAccounts.id, userId))
      .limit(1);

    if (!user || !user.privateKeyEncrypted) {
      throw new Error('No private key found for user');
    }

    return this.decryptPrivateKey(user.privateKeyEncrypted);
  }

  // Validate JWT token and get user
  async validateToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      
      // Check if session exists and is valid
      const [session] = await db.select()
        .from(userSessions)
        .where(and(
          eq(userSessions.sessionToken, token),
          eq(userSessions.userId, decoded.userId)
        ))
        .limit(1);

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      // Get user details
      const [user] = await db.select()
        .from(userAccounts)
        .where(and(
          eq(userAccounts.id, decoded.userId),
          eq(userAccounts.isActive, true)
        ))
        .limit(1);

      if (!user) {
        return null;
      }

      return this.formatUser(user);
    } catch (error) {
      return null;
    }
  }

  // Logout user (invalidate session)
  async logout(token: string): Promise<void> {
    await db.delete(userSessions)
      .where(eq(userSessions.sessionToken, token));
  }

  // Create user session
  private async createSession(userId: number, token: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await db.insert(userSessions).values({
      userId,
      sessionToken: token,
      expiresAt
    });
  }

  // Generate JWT token
  private generateToken(userId: number): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
  }

  // Encrypt private key
  private encryptPrivateKey(privateKey: string): string {
    return CryptoJS.AES.encrypt(privateKey, ENCRYPTION_KEY).toString();
  }

  // Decrypt private key
  private decryptPrivateKey(encryptedPrivateKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedPrivateKey, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Format user for API response
  private formatUser(user: UserAccount): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      hasPrivateKey: !!user.privateKeyEncrypted
    };
  }

  // Clean up expired sessions
  async cleanupExpiredSessions(): Promise<void> {
    await db.delete(userSessions)
      .where(eq(userSessions.expiresAt, new Date()));
  }

  async getAllUsers(): Promise<AuthenticatedUser[]> {
    const users = await db.select()
      .from(userAccounts)
      .where(eq(userAccounts.isActive, true));
    
    return users.map(user => this.formatUser(user));
  }
}

export const authService = new AuthService();