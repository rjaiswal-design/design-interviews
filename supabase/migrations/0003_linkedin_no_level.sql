-- LinkedIn in, level out.
--
-- `linkedin` is added and `level` is dropped. Two separate kinds of change, and
-- the order matters: the column has to exist before the app writes it, or every
-- candidate save comes back `column "linkedin" of relation "candidates" does
-- not exist` on a board people are using.
--
-- `portfolio` stays. A portfolio and a LinkedIn profile are different links
-- that answer different questions, and one of the two was being used for both
-- because there was nowhere else to put it.

begin;

alter table public.candidates
  add column if not exists linkedin text not null default '';

-- Dropped rather than left unused. A column the app no longer reads or writes
-- still shows up in every export, every `select *`, and every conversation with
-- somebody new about what this table holds — and the levels in it are stale the
-- moment the field stops being maintained.
alter table public.candidates
  drop column if exists level;

commit;

-- Expect linkedin present, level absent.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'candidates'
  and column_name in ('linkedin', 'level', 'portfolio')
order by column_name;
