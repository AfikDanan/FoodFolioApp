import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "../../constants/theme";
import getImageSource from "../../util/image";
import { departments } from "../../constants/recipeConstants";
import { hasPhoto, tintFor } from "../../util/recipeUtils";

export function RoundButton({ icon, onPress, size = 40, bg = C.chip, color = C.ink, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </TouchableOpacity>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={kit.segTrack}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            activeOpacity={0.8}
            onPress={() => onChange(o.key)}
            style={[kit.seg, on && kit.segOn]}
          >
            {o.icon && (
              <Ionicons name={o.icon} size={16} color={on ? C.ink : C.muted} />
            )}
            <Text style={[kit.segText, { color: on ? C.ink : C.muted }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, icon, dark }) {
  const bg = on ? (dark ? C.ink : C.accent) : C.card;
  const border = on ? (dark ? C.ink : C.accent) : C.line3;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[kit.chip, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[kit.chipText, { color: on ? C.white : C.ink }]}>{label}</Text>
      {icon && <Ionicons name={icon} size={14} color={C.white} />}
    </TouchableOpacity>
  );
}

export function Checkbox({ checked, onPress, round = true, size = 22 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : 7,
        borderWidth: 2,
        borderColor: checked ? C.accent : "#cfc8b9",
        backgroundColor: checked ? C.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && <Ionicons name="checkmark" size={size - 8} color={C.white} />}
    </TouchableOpacity>
  );
}

export function Stepper({ value, onChange, min = 1, max = 99 }) {
  return (
    <View style={kit.stepper}>
      <TouchableOpacity
        style={[kit.stepBtn, { backgroundColor: C.chip }]}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Ionicons name="remove" size={18} color={C.ink} />
      </TouchableOpacity>
      <Text style={kit.stepValue}>{value}</Text>
      <TouchableOpacity
        style={[kit.stepBtn, { backgroundColor: C.ink }]}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Ionicons name="add" size={18} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

// Recipe photo, or a flat tint when the recipe has none.
export function RecipeImage({ recipe, image, style, children }) {
  const img = image !== undefined ? image : recipe?.image;
  return (
    <View
      style={[
        { backgroundColor: tintFor(recipe?.id, recipe?.title), overflow: "hidden" },
        style,
      ]}
    >
      {hasPhoto(img) && (
        <Image
          source={getImageSource(img)}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      {children}
    </View>
  );
}

export function Sheet({ visible, onClose, children, radius = 28 }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={kit.scrim} onPress={onClose} />
      <View
        style={[
          kit.sheet,
          {
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
            paddingBottom: 34 + Math.max(0, insets.bottom - 20),
          },
        ]}
      >
        <View style={kit.grabber} />
        {children}
      </View>
    </Modal>
  );
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

// toast(text) shows a short note. toast(text, { label, onPress }) adds one button
// (for example "ביטול" to undo) and stays up longer so there is time to tap it.
export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      () => setMessage(null)
    );
  }, [opacity]);

  const show = useCallback(
    (text, action) => {
      setMessage({ text, action: action || null });
      clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, action ? 7000 : 2600);
    },
    [opacity, hide]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents={message.action ? "box-none" : "none"}
          style={[kit.toastWrap, { opacity }]}
        >
          <View style={[kit.toast, message.action && kit.toastWithAction]}>
            <Text style={[kit.toastText, message.action && { textAlign: "auto", flexShrink: 1 }]}>
              {message.text}
            </Text>
            {message.action && (
              <TouchableOpacity
                style={kit.toastAction}
                activeOpacity={0.7}
                onPress={() => {
                  hide();
                  message.action.onPress();
                }}
              >
                <Text style={kit.toastActionText}>{message.action.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// Compact - value + control for a quantity. The minus becomes a trash can when
// `removeAtMin` is set, so the last tap removes the item instead of going below it.
export function QuantityStepper({ label, onDec, onInc, removeAtMin }) {
  return (
    <View style={kit.qty}>
      <TouchableOpacity
        style={[kit.qtyBtn, { backgroundColor: removeAtMin ? "#f6e3de" : C.chip }]}
        onPress={onDec}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Ionicons
          name={removeAtMin ? "trash-outline" : "remove"}
          size={16}
          color={removeAtMin ? C.danger : C.ink}
        />
      </TouchableOpacity>
      <Text style={kit.qtyLabel} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        style={[kit.qtyBtn, { backgroundColor: C.ink }]}
        onPress={onInc}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Ionicons name="add" size={16} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

// Supermarket aisle icon: the illustration, or a placeholder glyph for aisles
// that do not have artwork yet.
export function DepartmentIcon({ name, size = 30 }) {
  const dept = departments.find((d) => d.name === name) || departments[departments.length - 1];
  if (dept.image) {
    return <Image source={dept.image} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: C.warnBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={dept.icon || "ellipse"} size={size * 0.55} color={C.warnText} />
    </View>
  );
}

// Pill switch used by the auto-fill options.
export function Toggle({ on, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        backgroundColor: on ? C.accent : C.line4,
        justifyContent: "center",
        paddingHorizontal: 3,
        // RTL: the knob rests at the start (right) when off and slides left when on.
        alignItems: on ? "flex-end" : "flex-start",
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: C.white,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 1,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      />
    </TouchableOpacity>
  );
}

export function SectionHeader({ title, link, onLink }) {
  return (
    <View style={kit.sectionRow}>
      <Text style={kit.sectionTitle}>{title}</Text>
      {link ? (
        <TouchableOpacity onPress={onLink}>
          <Text style={kit.sectionLink}>{link}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const kit = StyleSheet.create({
  segTrack: {
    flexDirection: "row",
    backgroundColor: C.chip,
    borderRadius: 12,
    padding: 3,
  },
  seg: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  segOn: {
    backgroundColor: C.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  segText: { fontFamily: F.semi, fontSize: 14 },
  chip: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipText: { fontFamily: F.medium, fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.ink,
    minWidth: 24,
    textAlign: "center",
  },
  qty: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  qtyLabel: {
    minWidth: 52,
    textAlign: "center",
    fontFamily: F.semi,
    fontSize: 13,
    color: C.ink,
  },
  scrim: { flex: 1, backgroundColor: C.scrim },
  sheet: {
    backgroundColor: C.paper,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.line4,
    alignSelf: "center",
    marginBottom: 14,
  },
  toastWrap: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: C.ink,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 14,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  toastWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 6,
    paddingEnd: 6,
  },
  toastAction: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  toastActionText: { color: C.white, fontFamily: F.bold, fontSize: 14 },
  toastText: {
    color: C.white,
    fontFamily: F.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionTitle: { fontFamily: F.display700, fontSize: 21, color: C.ink },
  sectionLink: { fontFamily: F.semi, fontSize: 14, color: C.accent },
});
