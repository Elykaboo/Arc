"use client";

export default function AdminModerationNavLink() {
  const href = "/admin/moderation";

  return (
    <div style={{ marginBottom: 8 }}>
      <a
        href={href}
        style={{
          display: "block",
          padding: "8px 10px",
          borderRadius: 6,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Moderation Dashboard
      </a>
    </div>
  );
}
