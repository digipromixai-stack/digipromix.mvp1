-- seed_demo_data still carried the implicit "GRANT EXECUTE TO PUBLIC" that every
-- new function gets unless explicitly revoked (same gotcha as get_app_secret in
-- the previous migration). The auth.uid() IS DISTINCT FROM p_user_id check added
-- there already blocks anon/cross-account abuse regardless, but closing the grant
-- too for defense-in-depth and consistency. authenticated keeps EXECUTE since the
-- frontend legitimately calls this as the logged-in user with their own id.
REVOKE EXECUTE ON FUNCTION public.seed_demo_data(uuid) FROM PUBLIC;
