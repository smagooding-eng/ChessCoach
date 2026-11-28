-- Members who joined in the last 36 hours: did they reach the first review and see the Pro offer?
WITH u AS (
  SELECT id, created_at, COALESCE(scout_username, chesscom_username, lichess_username, 'member') AS label,
    (chesscom_username IS NOT NULL OR lichess_username IS NOT NULL) AS linked, is_premium_override
  FROM users WHERE created_at >= now() - interval '36 hours' AND id NOT IN (SELECT id FROM analytics_excluded_users)
),
vis AS (SELECT DISTINCT pv.user_id, pv.visitor_id FROM pv_people pv JOIN u ON u.id = pv.user_id WHERE pv.visitor_id IS NOT NULL)
SELECT json_build_object(
  'member', u.label, 'joined', u.created_at, 'linked', u.linked, 'comped', u.is_premium_override,
  'games', (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id),
  'reviewed', (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id AND g.review_data IS NOT NULL),
  'funnel', (SELECT json_agg(json_build_object('e', f.event_type, 'at', f.created_at) ORDER BY f.created_at) FROM landing_funnel_events f
             WHERE f.visitor_id IN (SELECT visitor_id FROM vis WHERE vis.user_id = u.id) AND f.created_at >= u.created_at - interval '5 minutes'
               AND (f.event_type LIKE 'popup%' OR f.event_type LIKE 'trial%' OR f.event_type LIKE 'onboarding%')),
  'trialEvents', (SELECT json_agg(json_build_object('e', t.event, 's', t.source, 'at', t.created_at)) FROM trial_events t WHERE t.user_id = u.id),
  'pages', (SELECT json_agg(json_build_object('min', round((extract(epoch FROM (pv.created_at - u.created_at))/60.0)::numeric,1), 'p', pv.path) ORDER BY pv.created_at)
            FROM pv_people pv WHERE (pv.user_id = u.id OR pv.visitor_id IN (SELECT visitor_id FROM vis WHERE vis.user_id = u.id)) AND pv.created_at >= u.created_at - interval '2 minutes')
) FROM u ORDER BY u.created_at DESC;
