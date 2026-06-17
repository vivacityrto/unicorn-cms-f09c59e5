INSERT INTO public.dd_notification_event (value, label, is_active)
VALUES ('email_ticket.untriaged', 'Email Ticket Untriaged', true)
ON CONFLICT (value) DO NOTHING;