export const TAXONOMY: Record<string, string[]> = {
  "Mangueras Hidráulicas SAE/EN": [
    "SAE 100R1 / 1SN",
    "SAE 100R2 / 2SN",
    "SAE 100R12 / 4SP / 4SH",
    "GlobalCore / alta presión",
    "Push-Lok / baja presión",
  ],
  "Mangueras Termoplásticas": [
    "Termoplástica hidráulica",
    "Microbore / instrumentación",
  ],
  "Mangueras Especiales / No Hidráulicas": [
    "Aire / agua",
    "Succión / descarga",
    "Concreto / abrasión",
    "Clamp / especiales Parker",
  ],
  "Conexiones Prensables Roscadas": [
    "JIC 37°",
    "NPTF",
    "BSP",
    "Métrica",
    "ORFS / cara plana",
  ],
  "Conexiones Prensables de Brida": [
    "SAE 61",
    "SAE 62",
    "Brida recta",
    "Brida codo 45°/90°",
  ],
  "Conexiones Hidráulicas de Latón": [
    "JIC 37°",
    "NPTF",
    "BSP",
    "Roscada recta",
  ],
  "Adaptadores JIC 37°": [
    "Recto",
    "Codo 45°",
    "Codo 90°",
    "Reducción",
    "Unión",
  ],
  "Adaptadores NPTF": [
    "Recto",
    "Codo 45°",
    "Codo 90°",
    "Reducción",
    "Unión",
  ],
  "Adaptadores SAE O-Ring": [
    "ORB recto",
    "ORB codo 45°",
    "ORB codo 90°",
    "Reducción",
  ],
  "Adaptadores ORFS / Cara Plana": [
    "Macho FS",
    "Hembra FS",
    "Codo 45°",
    "Codo 90°",
    "Unión",
  ],
  "Adaptadores BSP": [
    "BSPP",
    "BSPT",
    "Recto",
    "Codo",
  ],
  "Adaptadores Métricos": [
    "Métrica recta",
    "Métrica codo",
    "Métrica reducción",
  ],
  "Uniones y Barriles Hidráulicos": [
    "Barril recto",
    "Barril reductor",
    "Unión doble",
  ],
  "Válvulas Hidráulicas": [
    "Check",
    "Bola",
    "Aguja",
  ],
  "Protectores y Accesorios de Manguera": [
    "Protector en espiral",
    "Cut-off",
    "Guardas / protección",
  ],
};

export const TAXONOMY_CATEGORIES = Object.keys(TAXONOMY);

export const TAXONOMY_SUBCATEGORIES = Array.from(
  new Set(Object.values(TAXONOMY).flat())
).sort((a, b) => a.localeCompare(b, "es"));
