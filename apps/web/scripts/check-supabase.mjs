// Supabase 설정이 제대로 됐는지 확인한다.
// 테이블·버킷이 있는지, 서버 키로 읽고 쓸 수 있는지만 본다. 키는 출력하지 않는다.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const read = (name) => new RegExp(`^${name}\\s*=\\s*(.+)$`, "m").exec(env)?.[1]?.trim();

const url = read("SUPABASE_URL");
const key = read("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !key) {
  console.log("❌ .env.local 에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  process.exit(1);
}

console.log(`프로젝트: ${url}`);
const supabase = createClient(url, key, { auth: { persistSession: false } });

// head:true 로 확인하면 테이블이 없어도 통과하는 경우가 있어 실제 조회로 확인한다
const { data: rows, error: tableError } = await supabase.from("evidence_files").select("id").limit(1);

if (tableError) {
  console.log(`❌ 테이블 evidence_files: ${tableError.message}`);
  console.log("   → Supabase 대시보드 → SQL Editor 에서 supabase/schema.sql 을 실행하세요.");
  console.log("   → 이미 실행했다면 다음 한 줄을 더 실행하세요: NOTIFY pgrst, 'reload schema';");
} else {
  console.log(`✅ 테이블 evidence_files 확인 (조회 가능, 표본 ${rows?.length ?? 0}건)`);

  const { data: all } = await supabase
    .from("evidence_files")
    .select("agreement_id, milestone_index, file_name, size_bytes, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (all?.length) {
    console.log("   최근 업로드:");
    for (const row of all) {
      const kb = row.size_bytes ? `${Math.round(row.size_bytes / 1024)}KB` : "-";
      console.log(
        `   · 계약 #${row.agreement_id} ${Number(row.milestone_index) + 1}단계 | ${row.file_name} (${kb})`,
      );
    }
  } else {
    console.log("   아직 올라온 파일이 없습니다.");
  }
}

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

if (bucketError) {
  console.log(`❌ 버킷 목록을 읽지 못했습니다: ${bucketError.message}`);
} else {
  const evidence = buckets.find((b) => b.name === "evidence");
  if (!evidence) {
    console.log("❌ 버킷 evidence 가 없습니다.");
    console.log(`   → 현재 버킷: ${buckets.map((b) => b.name).join(", ") || "(없음)"}`);
    console.log("   → Storage → New bucket 으로 'evidence' 를 만들고 Public 체크를 해제하세요.");
  } else if (evidence.public) {
    console.log("⚠️  버킷 evidence 가 공개(public)로 설정되어 있습니다.");
    console.log("   → 비공개로 바꾸세요. 공개면 주소를 아는 누구나 현장 사진을 볼 수 있습니다.");
  } else {
    console.log("✅ 버킷 evidence 확인 (비공개)");
  }
}
