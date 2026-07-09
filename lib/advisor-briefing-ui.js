export function getFirstName(name, fallback = "Michel") {
  const value = typeof name === "string" ? name.trim() : "";

  if (!value) {
    return fallback;
  }

  const [firstName] = value.split(/\s+/);

  return firstName || fallback;
}

export function getGreetingForDate(date = new Date(), name = "Michel") {
  const hour = date.getHours();
  const firstName = getFirstName(name);
  let greeting = "Good evening";

  if (hour >= 5 && hour < 12) {
    greeting = "Good morning";
  } else if (hour >= 12 && hour < 17) {
    greeting = "Good afternoon";
  }

  return `${greeting}, ${firstName}.`;
}

export function developmentCountLabel(count) {
  const labels = {
    1: "One",
    2: "Two",
    3: "Three",
    4: "Four",
    5: "Five",
  };
  const label = labels[count] || String(count);
  const noun = count === 1 ? "development deserves" : "developments deserve";

  return `${label} ${noun} your attention.`;
}

export function quietBriefingLines() {
  return [
    "Nothing currently requires action.",
    "Inventory, cash position, suppliers, and open decisions remain within expected ranges.",
    "I'll continue watching for meaningful changes.",
  ];
}

export function briefingOpeningLines(feed) {
  if (!feed?.cards?.length) {
    return quietBriefingLines();
  }

  return [
    "I've reviewed everything that changed since your last briefing.",
    developmentCountLabel(feed.cards.length),
  ];
}

export function evidenceStrengthLabel(value) {
  if (value === "limited") {
    return "Limited evidence";
  }

  if (value === "strong") {
    return "Strong evidence";
  }

  return "Moderate evidence";
}

export function confidenceLabel(value) {
  if (value === null || value === undefined) {
    return "Not enough evidence";
  }

  return `${Math.round(Number(value) || 0)}%`;
}

export function formatImpact(value) {
  const numberValue = Number(value) || 0;

  return `$${Math.round(numberValue).toLocaleString("en-US")}`;
}

export function endOfBriefingLine(hasHiddenCards = false) {
  if (hasHiddenCards) {
    return "Additional developments remain available in the investigation views.";
  }

  return "Nothing else currently requires your attention.";
}
