-- Private note storage for paid/free note files.
-- Files are accessed through short-lived signed URLs from server-side functions.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('notes', 'notes', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400;
