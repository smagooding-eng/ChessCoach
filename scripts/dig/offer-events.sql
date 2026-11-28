-- Offer and onboarding events in the last 36 hours, and whether page views keep query strings.
SELECT json_build_object('kind', 'event', 'e', event_type, 'n', COUNT(*), 'visitors', COUNT(DISTINCT visitor_id))
FROM landing_funnel_events WHERE created_at >= now() - interval '36 hours'
  AND (event_type LIKE 'popup%' OR event_type LIKE 'trial%' OR event_type LIKE 'onboarding%' OR event_type LIKE 'signup_completed%' OR event_type LIKE '%signup_completed')
GROUP BY event_type
UNION ALL
SELECT json_build_object('kind', 'trial_events', 'e', event, 's', source, 'n', COUNT(*)) FROM trial_events WHERE created_at >= now() - interval '7 days' GROUP BY event, source
UNION ALL
SELECT json_build_object('kind', 'pv_query', 'n', COUNT(*) FILTER (WHERE path LIKE '%?%'), 'total', COUNT(*)) FROM page_views WHERE created_at >= now() - interval '36 hours';
