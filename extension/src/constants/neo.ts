import { Platform, ViewStyle } from "react-native";

export const NEO_BG = "#F0F0F3";
export const NEO_TEXT = "#2D3748";
export const NEO_MUTED = "#8A94A6";
export const NEO_ACCENT = "#C8922A";
export const NEO_SHADOW_DARK = "#D1D5DD";
export const NEO_SHADOW_LIGHT = "#FFFFFF";

const webRaised: ViewStyle = {
  boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF",
};

const webRaisedSm: ViewStyle = {
  boxShadow: "3px 3px 8px #D1D5DD, -3px -3px 8px #FFFFFF",
};

const webRaisedMd: ViewStyle = {
  boxShadow: "5px 5px 12px #D1D5DD, -5px -5px 12px #FFFFFF",
};

const webInset: ViewStyle = {
  boxShadow: "inset 4px 4px 10px #D1D5DD, inset -4px -4px 10px #FFFFFF",
};

const webPressed: ViewStyle = {
  boxShadow: "inset 2px 2px 6px #D1D5DD, inset -2px -2px 6px #FFFFFF",
};

const webAccent: ViewStyle = {
  boxShadow: "4px 4px 10px #B07820, -4px -4px 10px #E0A840",
};

const webBottom: ViewStyle = {
  boxShadow: "0px -4px 12px #D1D5DD",
};

const nativeRaised: ViewStyle = {
  shadowColor: "#C8D0DA",
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 0.9,
  shadowRadius: 8,
  elevation: 6,
};

const nativeRaisedSm: ViewStyle = {
  shadowColor: "#C8D0DA",
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 0.8,
  shadowRadius: 5,
  elevation: 4,
};

const nativeRaisedMd: ViewStyle = {
  shadowColor: "#C8D0DA",
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 0.9,
  shadowRadius: 8,
  elevation: 5,
};

export const neoRaised = Platform.select<ViewStyle>({
  web: webRaised,
  default: nativeRaised,
});

export const neoRaisedSm = Platform.select<ViewStyle>({
  web: webRaisedSm,
  default: nativeRaisedSm,
});

export const neoRaisedMd = Platform.select<ViewStyle>({
  web: webRaisedMd,
  default: nativeRaisedMd,
});

export const neoInset = Platform.select<ViewStyle>({
  web: webInset,
  default: {
    shadowColor: "#C8D0DA",
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 0,
  },
});

export const neoPressed = Platform.select<ViewStyle>({
  web: webPressed,
  default: {
    shadowColor: "#C8D0DA",
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 0,
  },
});

export const neoAccentBtn = Platform.select<ViewStyle>({
  web: webAccent,
  default: {
    shadowColor: "#B07820",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
});

export const neoBottom = Platform.select<ViewStyle>({
  web: webBottom,
  default: {
    shadowColor: "#C8D0DA",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
});
