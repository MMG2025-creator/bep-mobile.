-- BEP manual knowledge candidates: additive extension for independently reviewed creations.
ALTER TABLE bep_knowledge_candidates
 DROP CONSTRAINT IF EXISTS bep_knowledge_candidates_proposal_type_check;
ALTER TABLE bep_knowledge_candidates
 ADD CONSTRAINT bep_knowledge_candidates_proposal_type_check
 CHECK(proposal_type IN ('clarify','update','deactivate','create'));
