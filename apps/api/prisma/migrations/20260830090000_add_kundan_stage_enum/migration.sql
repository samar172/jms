-- Add the new Kundan production stage to the enum, positioned before Setting.
ALTER TYPE "ProdStageName" ADD VALUE IF NOT EXISTS 'Kundan' BEFORE 'Setting';
