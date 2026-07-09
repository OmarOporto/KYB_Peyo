import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const raw = readFileSync("./.env.local","utf8");
for (const l of raw.split("\n")){const m=l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const path = "test/hello.txt";
const up = await s.storage.from("kyb-documents").upload(path, Buffer.from("hola kyb"), {contentType:"text/plain",upsert:true});
console.log("upload:", up.error ? "ERROR "+up.error.message : "OK "+up.data.path);
const signed = await s.storage.from("kyb-documents").createSignedUrl(path, 60);
console.log("signedUrl:", signed.error ? "ERROR "+signed.error.message : "OK");
await s.storage.from("kyb-documents").remove([path]);
console.log("cleanup: OK");
