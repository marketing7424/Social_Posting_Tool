/**
 * Ant Design theme configuration
 * Design System: Vibrant & Block-based (UI/UX Pro Max)
 * Colors: Blue primary + Orange CTA on light slate background
 * Typography: Inter (clean SaaS dashboard feel)
 */
export const theme = {
  token: {
    // Colors
    colorPrimary: '#2563EB',
    colorSuccess: '#16A34A',
    colorWarning: '#F97316',
    colorError: '#DC2626',
    colorInfo: '#2563EB',

    // Background
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F1F5F9',
    colorBgElevated: '#FFFFFF',

    // Text
    colorText: '#1E293B',
    colorTextSecondary: '#64748B',
    colorTextTertiary: '#94A3B8',

    // Border
    colorBorder: '#E2E8F0',
    colorBorderSecondary: '#F1F5F9',

    // Typography
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,

    // Shape
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,

    // Spacing
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,

    // Shadows
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary: '0 4px 12px rgba(0,0,0,0.08)',

    // Motion
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',

    // Control
    controlHeight: 40,
    controlHeightLG: 48,
    controlHeightSM: 32,
  },
  components: {
    Button: {
      primaryShadow: '0 2px 4px rgba(37,99,235,0.3)',
      borderRadius: 8,
      controlHeight: 40,
      controlHeightLG: 48,
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 20,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Select: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(255,255,255,0.12)',
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemPaddingInline: 16,
    },
    Table: {
      borderRadius: 10,
      headerBg: '#F8FAFC',
      headerColor: '#64748B',
    },
    Tabs: {
      inkBarColor: '#2563EB',
      itemActiveColor: '#2563EB',
      itemSelectedColor: '#2563EB',
    },
    Steps: {
      colorPrimary: '#2563EB',
    },
    Modal: {
      borderRadiusLG: 16,
    },
  },
};
