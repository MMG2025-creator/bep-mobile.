-- Allow explicit creation proposals for new institutional Coach knowledge.
ALTER TABLE bep_knowledge_candidates
 DROP CONSTRAINT IF EXISTS bep_knowledge_candidates_proposal_type_check;
ALTER TABLE bep_knowledge_candidates
 ADD CONSTRAINT bep_knowledge_candidates_proposal_type_check
 CHECK (proposal_type IN ('clarify','create','update','deactivate'));
