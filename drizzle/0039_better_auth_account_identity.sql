-- Better Auth >=1.7.3 identifies accounts by provider_id/account_id and no
-- longer writes issuer. Remove the obsolete constraint using SQLite's native
-- column removal; retain account IDs, user links, credentials and sessions.
DROP INDEX `account_issuer_accountId_uidx`;
--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;
