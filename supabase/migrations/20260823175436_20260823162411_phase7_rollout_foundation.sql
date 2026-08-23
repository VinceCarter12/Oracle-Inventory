create type "RolloutStatus" as enum ('disabled', 'staged', 'pilot', 'enabled', 'paused');

create table "FeatureRollout" (
  "id" text primary key not null,
  "key" text not null unique,
  "enabledGlobally" boolean not null default false,
  "status" "RolloutStatus" not null default 'disabled',
  "minimumRole" text,
  "configVersion" integer not null default 1,
  "updatedById" text references "SystemUser"("id") on delete set null on update cascade,
  "updatedAt" timestamptz(3) not null,
  "createdAt" timestamptz(3) not null default now()
);

create table "FeatureRolloutBranch" (
  "id" text primary key not null,
  "featureKey" text not null references "FeatureRollout"("key") on delete cascade on update cascade,
  "branchId" text not null references "Branch"("id") on delete cascade on update cascade,
  "enabled" boolean not null,
  "reason" text,
  "updatedById" text references "SystemUser"("id") on delete set null on update cascade,
  "updatedAt" timestamptz(3) not null,
  "createdAt" timestamptz(3) not null default now(),
  unique ("featureKey", "branchId")
);

create index "FeatureRolloutBranch_branchId_idx" on "FeatureRolloutBranch"("branchId");

alter table "FeatureRollout" enable row level security;
alter table "FeatureRolloutBranch" enable row level security;
revoke all on table "FeatureRollout" from anon, authenticated;
revoke all on table "FeatureRolloutBranch" from anon, authenticated;

