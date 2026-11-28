-- Same-day review messages: how many members were told about a new game, and by what.
SELECT json_build_object(
  'membersEverTold', (SELECT COUNT(*) FROM sameday_reviews WHERE last_notified_at IS NOT NULL),
  'toldLast7d', (SELECT COUNT(*) FROM sameday_reviews WHERE last_notified_at > now() - interval '7 days'),
  'emailedLast7d', (SELECT COUNT(*) FROM sameday_reviews WHERE last_emailed_at > now() - interval '7 days'),
  'membersWithPush', (SELECT COUNT(DISTINCT user_id) FROM push_subscriptions),
  'membersWithNewGameLast7d', (SELECT COUNT(DISTINCT user_id) FROM games WHERE platform IN ('chesscom','lichess') AND played_at > now() - interval '7 days' AND created_at > played_at),
  'emailsOpened', (SELECT json_agg(x) FROM (SELECT template, COUNT(*) sent, COUNT(*) FILTER (WHERE opened_at IS NOT NULL) opened, COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) clicked FROM email_tracking WHERE template = 'sameday_review' AND sent_at > now() - interval '30 days' GROUP BY template) x)
);
