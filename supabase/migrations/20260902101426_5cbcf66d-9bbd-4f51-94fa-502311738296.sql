-- Let the app read seller/buyer names alongside listings, threads and messages
ALTER TABLE public.listings
  ADD CONSTRAINT listings_seller_profile_fkey
  FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.threads
  ADD CONSTRAINT threads_buyer_profile_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.threads
  ADD CONSTRAINT threads_seller_profile_fkey
  FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_profile_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;