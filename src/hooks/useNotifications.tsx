import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
  tenant_id: number | null;
  tenant_name: string | null;
  source_id: string | null;
}

export const useNotifications = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_notifications')
        .select('id, title, message, type, is_read, link, created_at, tenant_id, source_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const rows = (data || []) as any[];

      // Fetch tenant names for notifications that have a tenant_id
      const tenantIds = [...new Set(rows.filter(r => r.tenant_id).map(r => r.tenant_id))];
      let tenantMap = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id, name')
          .in('id', tenantIds);
        (tenants || []).forEach((t: any) => tenantMap.set(t.id, t.name));
      }

      const enriched: Notification[] = rows.map(r => ({
        ...r,
        tenant_name: r.tenant_id ? (tenantMap.get(r.tenant_id) || null) : null,
      }));

      setNotifications(enriched);
      setUnreadCount(enriched.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = async (notificationId: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true } as any)
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      fetchNotifications(); // revert on error
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    const prevNotifications = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true } as any)
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('markAllAsRead error:', error);
        // Revert
        setNotifications(prevNotifications);
        setUnreadCount(prevNotifications.filter(n => !n.is_read).length);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setNotifications(prevNotifications);
      setUnreadCount(prevNotifications.filter(n => !n.is_read).length);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      fetchNotifications();

      const channel = supabase
        .channel('user-notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => fetchNotifications()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    init();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
};
