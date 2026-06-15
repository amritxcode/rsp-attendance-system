-- ============================================================
-- SQL Setup Script for RSP Attendance in Supabase
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Trainees Table
CREATE TABLE IF NOT EXISTS public.trainees (
  uid UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  trainee_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(full_name) >= 3),
  department TEXT NOT NULL,
  batch TEXT NOT NULL,
  email TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL
);

-- 3. Create Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY, -- Format: YYYY-MM-DD_SESSION_traineeId
  trainee_id TEXT NOT NULL REFERENCES public.trainees(trainee_id) ON UPDATE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  batch TEXT NOT NULL,
  email TEXT NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('MORNING', 'MIDDAY')),
  date DATE NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  distance_from_institute NUMERIC NOT NULL CHECK (distance_from_institute <= 200),
  gps_accuracy NUMERIC NOT NULL CHECK (gps_accuracy <= 50),
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.trainees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 5. Set up Trainees Table RLS Policies
CREATE POLICY "Enable insert for users own profile"
  ON public.trainees FOR INSERT
  WITH CHECK (auth.uid() = uid);

CREATE POLICY "Enable read for own profile or admin"
  ON public.trainees FOR SELECT
  USING (
    auth.uid() = uid OR 
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Enable update for own profile or admin"
  ON public.trainees FOR UPDATE
  USING (
    auth.uid() = uid OR 
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Enable delete for admin only"
  ON public.trainees FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 6. Set up Attendance Table RLS Policies
CREATE POLICY "Enable insert for own attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (
    auth.uid() = uid 
    AND distance_from_institute <= 200
    AND gps_accuracy <= 50
    AND EXISTS (
      SELECT 1 FROM public.trainees 
      WHERE trainees.uid = auth.uid() 
      AND trainees.trainee_id = attendance.trainee_id
    )
  );

CREATE POLICY "Enable read for own records or admin"
  ON public.attendance FOR SELECT
  USING (
    uid = auth.uid() OR 
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Enable update/delete for admin only"
  ON public.attendance FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 7. Database Indexes (equivalent to firestore.indexes.json)
CREATE INDEX IF NOT EXISTS idx_attendance_trainee_timestamp 
  ON public.attendance (trainee_id ASC, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_date_session 
  ON public.attendance (date ASC, session ASC);

CREATE INDEX IF NOT EXISTS idx_attendance_date_dept 
  ON public.attendance (date ASC, department ASC);

CREATE INDEX IF NOT EXISTS idx_attendance_uid_timestamp 
  ON public.attendance (uid ASC, timestamp DESC);

-- 8. Trigger to automatically create trainee profile on auth sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.trainees (uid, trainee_id, full_name, department, batch, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'trainee_id',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'batch',
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if trigger exists first, and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
