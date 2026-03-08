import { Request, Response } from 'express';
import prisma from '../db';
import bcrypt from 'bcrypt';
import { generateToken } from '../utils/jwt.utils';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(2),
  phone: z.string().min(5)
});

export const register = async (req: Request, res: Response) => {
  try {
    const parsedData = registerSchema.parse(req.body);
    const { email, password, full_name, phone } = parsedData;

    // Check if user already exists
    const existingUser = await prisma.profiles.findFirst({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // In Supabase, the user table is "auth.users" and the business logic table is "public.profiles".
    // Since we are migrating the exact Supabase database to AWS RDS without schema changes,
    // we use a RAW SQL query to insert into the existing "auth.users" table structure.
    
    // Create UUID for the new user
    const userId = crypto.randomUUID();

    // Insert into auth.users (Supabase's hidden auth table)
    await prisma.$executeRaw`
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      VALUES (${userId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${email}, ${hashedPassword}, now(), now(), now())
    `;

    // Insert into public.profiles (Supabase's trigger usually does this, but we'll manually ensure it in Node)
    await prisma.$executeRaw`
      INSERT INTO public.profiles (id, email, full_name, phone, created_at, updated_at, is_frozen, verified)
      VALUES (${userId}::varchar, ${email}, ${full_name}, ${phone}, now()::text, now()::text, false, false)
    `;

    return res.status(201).json({ 
      message: 'Registration successful! The existing auth.users schema is preserved.',
      user: { id: userId, email, full_name }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const login = async (req: Request, res: Response) => {
  try {
    const parsedData = loginSchema.parse(req.body);
    const { email, password } = parsedData;

    // Fetch user from the hidden auth.users table instead of Prisma profiles
    const authUsers: any[] = await prisma.$queryRaw`
      SELECT id, encrypted_password FROM auth.users WHERE email = ${email} LIMIT 1
    `;

    if (authUsers.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser = authUsers[0];

    // Supabase pg_crypto hashes format nicely to standard bcrypt
    const passwordMatch = await bcrypt.compare(password, authUser.encrypted_password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Now fetch the public profile data
    const profile = await prisma.profiles.findFirst({
      where: { id: authUser.id }
    });

    const token = generateToken(authUser.id, 'tenant'); // default role placeholder

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: authUser.id,
        email: email,
        full_name: profile?.full_name || ''
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
};
