CREATE TABLE security_upload_budgets (
  id TEXT PRIMARY KEY NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  files INTEGER NOT NULL CHECK (files >= 0),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE security_uploads (
  storage_key TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'stored' CHECK (state IN ('stored', 'deleting', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX security_uploads_cleanup ON security_uploads(state, created_at);
--> statement-breakpoint
CREATE TRIGGER security_media_attachment BEFORE UPDATE OF item_id, post_id, thread_id ON community_media
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE storage_key = 'community/' || NEW.id || '.jpg' AND state != 'stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_product_image_insert BEFORE INSERT ON product_images
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE storage_key=NEW.storage_key AND state!='stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_product_primary_update BEFORE UPDATE OF primary_image_url ON products
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE '/media/' || storage_key=NEW.primary_image_url AND state!='stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_resolution_file_insert BEFORE INSERT ON resolution_files
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE storage_key=NEW.storage_key AND state!='stored')
BEGIN SELECT RAISE(ABORT, 'File expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_avatar_attachment BEFORE UPDATE OF avatar_url ON collector_profiles
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE '/community/media/' || substr(storage_key, 11, length(storage_key) - 14) = NEW.avatar_url AND state != 'stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_cover_attachment BEFORE UPDATE OF cover_id ON community_settings
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE storage_key = 'community/' || NEW.cover_id || '.jpg' AND state != 'stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
--> statement-breakpoint
CREATE TRIGGER security_logo_attachment BEFORE UPDATE OF logo_url ON sellers
WHEN EXISTS (SELECT 1 FROM security_uploads WHERE '/media/' || storage_key = NEW.logo_url AND state != 'stored')
BEGIN SELECT RAISE(ABORT, 'Photo expired; upload it again.'); END;
