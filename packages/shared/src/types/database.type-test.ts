import type { Database, MatchNoteRow } from './database.ts';

type Expect<T extends true> = T;

type RpcMatchNote =
  Database['public']['Functions']['match_notes']['Returns'][number];
type RpcCaptureNoteArgs =
  Database['public']['Functions']['capture_note_atomic']['Args'];

type _CapturePersonalContextAllowsNull = Expect<
  null extends RpcCaptureNoteArgs['input_personal_context'] ? true : false
>;
type _CaptureSourceTitleAllowsNull = Expect<
  null extends RpcCaptureNoteArgs['input_source_title'] ? true : false
>;
type _CaptureSourceUrlAllowsNull = Expect<
  null extends RpcCaptureNoteArgs['input_source_url'] ? true : false
>;

type _PersonalContextAllowsNull = Expect<
  null extends RpcMatchNote['personal_context'] ? true : false
>;
type _SourceTitleAllowsNull = Expect<
  null extends RpcMatchNote['source_title'] ? true : false
>;
type _SourceUrlAllowsNull = Expect<
  null extends RpcMatchNote['source_url'] ? true : false
>;
type _ExportedRowMatchesRpc = Expect<
  MatchNoteRow extends RpcMatchNote
    ? RpcMatchNote extends MatchNoteRow
      ? true
      : false
    : false
>;
