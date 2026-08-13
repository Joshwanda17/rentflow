CREATE INDEX IF NOT EXISTS idx_profiles_village ON public.profiles (village) WHERE village IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_region_district ON public.profiles (region, district) WHERE district IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_sub_county ON public.profiles (sub_county) WHERE sub_county IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_parish ON public.profiles (parish) WHERE parish IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_ug_village_id ON public.profiles (ug_village_id) WHERE ug_village_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_location_source ON public.profiles (location_source) WHERE location_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_district_village_trgm ON public.profiles USING gin ((coalesce(district,'') || ' ' || coalesce(village,'')) gin_trgm_ops);