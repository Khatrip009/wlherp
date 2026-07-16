// src/components/NotificationBell.jsx
import { useState, useRef, useEffect } from "react";
import { Badge, Popover, List, Button, Typography, Space } from "antd";
import {
  BellOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";

const { Text } = Typography;

export default function NotificationBell() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // ── Unread count ──
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notification-unread-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);
      return error ? 0 : count || 0;
    },
    refetchInterval: 30_000,
    enabled: !!profile?.id,
  });

  // ── Recent notifications (only fetched when popover is open) ──
  const { data: recentNotifications = [] } = useQuery({
    queryKey: ["notifications-recent", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return error ? [] : data;
    },
    enabled: open && !!profile?.id,
  });

  // ── Mark all as read ──
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent", profile?.id] });
    },
  });

  // ── Mark single as read ──
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent", profile?.id] });
    },
  });

  // ── Popover content ──
  const notificationContent = (
    <div style={{ width: 360, maxWidth: "calc(100vw - 48px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text strong style={{ fontSize: 16 }}>Notifications</Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            onClick={() => markAllReadMutation.mutate()}
            loading={markAllReadMutation.isLoading}
          >
            Mark all read
          </Button>
        )}
      </div>
      {recentNotifications.length === 0 ? (
        <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>
          No notifications
        </div>
      ) : (
        <List
          dataSource={recentNotifications}
          renderItem={(item) => (
            <List.Item
              style={{
                background: item.is_read ? "transparent" : "#e6f7ff",
                padding: "8px 12px",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={() => {
                if (!item.is_read) {
                  markReadMutation.mutate(item.id);
                }
              }}
            >
              <List.Item.Meta
                title={<Text strong={!item.is_read}>{item.title}</Text>}
                description={
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.message}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </>
                }
              />
              {!item.is_read && (
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    markReadMutation.mutate(item.id);
                  }}
                />
              )}
            </List.Item>
          )}
        />
      )}
      <div style={{ textAlign: "center", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        <Button
          type="link"
          onClick={() => {
            setOpen(false);
            navigate("/notifications");
          }}
        >
          View all notifications
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={notificationContent}
      title={null}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <BellOutlined style={{ fontSize: 20, cursor: "pointer" }} />
      </Badge>
    </Popover>
  );
}