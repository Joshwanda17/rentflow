
-- Add video_url column to house_listings
ALTER TABLE public.house_listings ADD COLUMN IF NOT EXISTS video_url text;

-- Create house-videos storage bucket (public for tenant viewing)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('house-videos', 'house-videos', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Agents can upload videos to their own folder
CREATE POLICY "agents_upload_house_videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'house-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Agents can delete their own videos
CREATE POLICY "agents_delete_house_videos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'house-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read access for tenants
CREATE POLICY "public_read_house_videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'house-videos');
