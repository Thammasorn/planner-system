import { sql as dsql } from 'drizzle-orm'
import { auth } from '../src/server/auth'
import { db, sql } from '../src/server/db/client'
await db.execute(dsql`truncate login_attempts`)
const h = (ip: string) => new Headers({ 'x-forwarded-for': ip })
const attempt = (pw: string, ip = '10.8.8.8', email = 'manager@example.com') =>
  auth.api.signInEmail({ body: { email, password: pw }, headers: h(ip) }).then(() => '200 OK', (e: any) => `${e.statusCode} ${e.body?.code} ${e.body?.code === 'LOGIN_LOCKED' ? e.body?.message : ''}`)
for (let i = 1; i <= 5; i++) console.log(`wrong #${i} ->`, await attempt('wrong-' + i))
console.log('correct pw, same ip+email ->', await attempt('initial-pass-1'))
console.log('correct pw, other ip       ->', await attempt('initial-pass-1', '10.8.8.9'))
console.log('other email, same ip       ->', await attempt('nope-nope', '10.8.8.8', 'cindy@example.com'))
await db.execute(dsql`update login_attempts set attempted_at = attempted_at - interval '16 minutes'`)
console.log('after 16 min (simulated)   ->', await attempt('initial-pass-1'))
console.log('rows left for key after success:', (await db.execute(dsql`select count(*)::int as n from login_attempts where key = '10.8.8.8|manager@example.com'`))[0])
await sql.end()
