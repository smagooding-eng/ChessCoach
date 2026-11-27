-- Members who signed up in the last 21 days: what each one did, from their
-- first page view on. Read-only. One JSON object per member.
WITH u AS (
  SELECT id, created_at, COALESCE(scout_username, chesscom_username, lichess_username, 'member') AS label,
    country, auth_provider, (chesscom_username IS NOT NULL) AS chesscom, (lichess_username IS NOT NULL) AS lichess
  FROM users
  WHERE created_at >= now() - interval '21 days' AND id NOT IN (SELECT id FROM analytics_excluded_users)
),
browsers AS (SELECT DISTINCT pv.user_id, pv.visitor_id FROM pv_people pv JOIN u ON pv.user_id = u.id WHERE pv.visitor_id IS NOT NULL),
views AS (
  SELECT DISTINCT ON (p.id) p.owner, p.created_at, p.path, p.device FROM (
    SELECT pv.id, pv.created_at, pv.path, pv.device, b.user_id AS owner FROM pv_people pv JOIN browsers b ON b.visitor_id = pv.visitor_id
    UNION ALL
    SELECT pv.id, pv.created_at, pv.path, pv.device, pv.user_id AS owner FROM pv_people pv WHERE pv.user_id IN (SELECT id FROM u)) p
  JOIN u ON u.id = p.owner AND p.created_at >= u.created_at - interval '30 minutes'
)
SELECT json_build_object(
  'member', u.label, 'signedUp', u.created_at, 'with', u.auth_provider, 'country', u.country,
  'chesscom', u.chesscom, 'lichess', u.lichess,
  'daysActive', (SELECT COUNT(DISTINCT (pv.created_at AT TIME ZONE 'America/New_York')::date) FROM pv_people pv WHERE pv.user_id = u.id),
  'lastSeen', (SELECT MAX(created_at) FROM views v WHERE v.owner = u.id),
  'games', (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id),
  'gamesByPlatform', (SELECT json_object_agg(platform, n) FROM (SELECT platform, COUNT(*) n FROM games g WHERE g.user_id = u.id GROUP BY platform) x),
  'reviewed', (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id AND g.review_data IS NOT NULL),
  'puzzles', (SELECT json_build_object('tried', COUNT(*), 'solved', COUNT(*) FILTER (WHERE solved)) FROM puzzle_attempts pa WHERE pa.user_id = u.id),
  'tactics', (SELECT json_build_object('attempts', COALESCE(SUM(attempts),0), 'solved', COALESCE(SUM(solved),0)) FROM tactics_progress t WHERE t.user_id = u.id),
  'traps', (SELECT COUNT(*) FROM trap_progress tp WHERE tp.user_id = u.id),
  'liveGames', (SELECT COUNT(*) FROM live_games lg WHERE lg.white_user_id = u.id OR lg.black_user_id = u.id),
  'emails', (SELECT json_agg(json_build_object('type', drip_type, 'at', sent_at) ORDER BY sent_at) FROM email_drip_log e WHERE e.user_id = u.id),
  'push', EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id),
  'device', (SELECT device FROM views v WHERE v.owner = u.id GROUP BY device ORDER BY COUNT(*) DESC LIMIT 1),
  'views', (SELECT json_agg(json_build_object('min', round((extract(epoch FROM (v.created_at - u.created_at)) / 60.0)::numeric, 1),
              'page', regexp_replace(regexp_replace(v.path, '/[0-9]+(?=/|$)', '/:id', 'g'), '/[A-Za-z0-9_-]{20,}(?=/|$)', '/:token', 'g')) ORDER BY v.created_at)
            FROM views v WHERE v.owner = u.id)
)
FROM u ORDER BY u.created_at DESC;
