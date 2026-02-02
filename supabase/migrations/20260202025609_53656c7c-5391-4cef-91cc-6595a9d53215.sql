
-- Fix infinite recursion in eos_meeting_ratings RLS policies
-- The problem: eos_meeting_ratings policies reference tenant_users which has recursive policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view ratings for their tenant" ON eos_meeting_ratings;
DROP POLICY IF EXISTS "Users can insert their own rating" ON eos_meeting_ratings;
DROP POLICY IF EXISTS "Users can update their own rating" ON eos_meeting_ratings;

-- Create new policies that avoid the tenant_users recursion by joining through eos_meetings
-- This works because eos_meetings already has its own RLS that users can query

-- SELECT: Users can view ratings for meetings they're part of
CREATE POLICY "Users can view ratings for their meetings"
ON eos_meeting_ratings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_ratings.meeting_id
  )
);

-- INSERT: Users can only insert their own rating for meetings they can see
CREATE POLICY "Users can insert their own rating"
ON eos_meeting_ratings FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_ratings.meeting_id
  )
);

-- UPDATE: Users can only update their own rating
CREATE POLICY "Users can update their own rating"
ON eos_meeting_ratings FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own rating
CREATE POLICY "Users can delete their own rating"
ON eos_meeting_ratings FOR DELETE
USING (user_id = auth.uid());
