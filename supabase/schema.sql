-- GIWA Trust Escrow — 증빙 파일 메타데이터
--
-- 온체인이 계약의 기준이고, 여기에는 파일이 어디 있는지와 그 지문만 둔다.
-- 개인정보(주소·연락처·실명)는 저장하지 않는다.
--
-- 실행 방법: Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 Run

create table if not exists evidence_files (
  id uuid primary key default gen_random_uuid(),

  -- 어느 체인의 어느 계약인지. 컨트랙트를 재배포해도 기록이 섞이지 않는다.
  chain_id bigint not null,
  contract_address text not null,
  agreement_id numeric not null,
  milestone_index integer not null,

  -- 누가 올렸는지 (지갑 주소, 소문자로 저장)
  uploaded_by_wallet text not null,

  -- Storage 안의 경로. 비공개 버킷이라 이 값만으로는 열 수 없다.
  storage_path text not null,

  file_name text not null,
  mime_type text,
  size_bytes bigint,

  -- 온체인에 기록된 값과 같아야 한다. 다르면 파일이 바뀐 것이다.
  sha256_hash text not null,

  created_at timestamptz not null default now()
);

create index if not exists evidence_files_lookup_idx
  on evidence_files (chain_id, contract_address, agreement_id, milestone_index, created_at desc);

-- 브라우저(anon 키)에서 직접 읽고 쓰지 못하게 막는다.
-- 정책을 하나도 만들지 않으므로 service role 키를 쓰는 서버 라우트만 접근할 수 있다.
-- 서버 라우트가 "요청한 지갑이 이 계약의 당사자인가"를 온체인에서 확인한 뒤에만
-- 서명된 URL 을 내준다.
alter table evidence_files enable row level security;
