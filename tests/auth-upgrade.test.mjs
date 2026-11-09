import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";

test("auth upgrade preserves existing identities and sessions and permits accounts without issuer", async t => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql") && name < "0039").sort()) {
    db.exec(await readFile(new URL(name, directory), "utf8"));
  }
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    INSERT INTO user(id,name,email,created_at,updated_at) VALUES('existing','Existing','existing@example.test',1,1);
    INSERT INTO account(id,issuer,account_id,provider_id,user_id,access_token,created_at,updated_at)
      VALUES('linked','https://identity.example.test','provider-account','provider','existing','synthetic-access',1,1);
    INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at)
      VALUES('existing-session','synthetic-session','existing',9999999999999,1,1);
  `);
  const accountBefore = { ...db.prepare("SELECT * FROM account WHERE id='linked'").get() };
  delete accountBefore.issuer;
  const sessionBefore = { ...db.prepare("SELECT * FROM session").get() };
  db.exec(await readFile(new URL("0039_better_auth_account_identity.sql", directory), "utf8"));
  assert.deepEqual({ ...db.prepare("SELECT * FROM account WHERE id='linked'").get() }, accountBefore);
  assert.deepEqual({ ...db.prepare("SELECT * FROM session").get() }, sessionBefore);
  assert.equal(db.prepare("SELECT email FROM user WHERE id='existing'").get().email, "existing@example.test");
  db.exec(`INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at)
    VALUES('new-link','provider-account','another-provider','existing',2,2)`);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM account").get().count, 2);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
