"""
MARIAM — Registre unique des tags alimentaires et certifications.

CE FICHIER EST LA SOURCE DE VÉRITÉ.

Les tables DB sont peuplées à partir de ces données lors de la migration
initiale. Elles servent ensuite de référentiel pour les FK.
"""

# ──────────────────────────────────────────────────────────────────────
#  CATÉGORIES DE TAGS ALIMENTAIRES
# ──────────────────────────────────────────────────────────────────────

DIETARY_TAG_CATEGORIES = [
    {
        "id": "regime_composition",
        "name": "Régime / composition",
        "color": "green",
        "sort_order": 1,
    },
    {
        "id": "exclusions",
        "name": "Allergènes / exclusions",
        "color": "amber",
        "sort_order": 2,
    },
    {
        "id": "preparation",
        "name": "Préparation",
        "color": "blue",
        "sort_order": 3,
    },
    {
        "id": "taste_profile",
        "name": "Goût / profil",
        "color": "orange",
        "sort_order": 4,
    },
]

# ──────────────────────────────────────────────────────────────────────
#  TAGS ALIMENTAIRES (déclaratifs, pas de certification externe)
# ──────────────────────────────────────────────────────────────────────

DIETARY_TAGS = [
    # ── Régime / composition ──
    {"id": "vegetarian",      "label": "Végétarien",           "icon": "leaf",         "color": "green",  "category_id": "regime_composition", "sort_order": 1},
    {"id": "vegan",           "label": "Vegan",                "icon": "sprout",       "color": "green",  "category_id": "regime_composition", "sort_order": 2},
    {"id": "pescetarian",     "label": "Pescetarien",          "icon": "fish",         "color": "blue",   "category_id": "regime_composition", "sort_order": 3},
    {"id": "halal",           "label": "Halal (déclaratif)",   "icon": "badge-check",  "color": "teal",   "category_id": "regime_composition", "sort_order": 4},
    {"id": "pork_free",       "label": "Sans porc",            "icon": "ban",          "color": "orange", "category_id": "regime_composition", "sort_order": 5},
    {"id": "alcohol_free",    "label": "Sans alcool",          "icon": "wine-off",     "color": "purple", "category_id": "regime_composition", "sort_order": 6},
    # ── Exclusions simplifiées ──
    {"id": "gluten_free",     "label": "Sans gluten",          "icon": "wheat-off",    "color": "amber",  "category_id": "exclusions",         "sort_order": 7},
    {"id": "lactose_free",    "label": "Sans lactose",         "icon": "milk-off",     "color": "blue",   "category_id": "exclusions",         "sort_order": 8},
    {"id": "nut_free",        "label": "Sans fruits à coque",  "icon": "nut-off",      "color": "amber",  "category_id": "exclusions",         "sort_order": 9},
    # ── Préparation ──
    {"id": "homemade",        "label": "Fait maison",          "icon": "chef-hat",     "color": "blue",   "category_id": "preparation",        "sort_order": 10},
    {"id": "chef_special",    "label": "Plat du chef",         "icon": "sparkles",     "color": "indigo", "category_id": "preparation",        "sort_order": 11},
    {"id": "traditional",     "label": "Recette traditionnelle","icon": "notebook-pen", "color": "orange", "category_id": "preparation",        "sort_order": 12},
    {"id": "local_product",   "label": "Produit local",        "icon": "map-pin",      "color": "blue",   "category_id": "preparation",        "sort_order": 13},
    {"id": "seasonal",        "label": "Produit de saison",    "icon": "tree-pine",    "color": "green",  "category_id": "preparation",        "sort_order": 14},
    {"id": "hot_appetizer",   "label": "Entrée chaude",        "icon": "soup",         "color": "orange", "category_id": "preparation",        "sort_order": 15},
    # ── Goût / profil ──
    {"id": "spicy",           "label": "Épicé",                "icon": "flame",        "color": "red",    "category_id": "taste_profile",      "sort_order": 15},
    {"id": "low_salt",        "label": "Peu salé",             "icon": "droplets",     "color": "cyan",   "category_id": "taste_profile",      "sort_order": 16},
    {"id": "sweet_savory",    "label": "Sucré-salé",           "icon": "candy",        "color": "pink",   "category_id": "taste_profile",      "sort_order": 17},
]

# Mots-clés de détection CSV  (tag_id → liste de mots-clés, minuscule)
DIETARY_TAG_KEYWORDS: dict[str, list[str]] = {
    "vegetarian":   ["végétarien", "vegetarien", "veggie", "sans viande", "vg", "🌱", "🥬", "🥗", "🥦"],
    "vegan":        ["vegan", "végan", "vgn"],
    "pescetarian":  ["pescetarien", "pescétarien"],
    "halal":        ["halal", "hl", "🕌"],
    "pork_free":    ["sans porc", "sans-porc", "no pork", "sp"],
    "alcohol_free": ["sans alcool", "alcohol free"],
    "gluten_free":  ["sans gluten", "gluten free", "gluten-free", "sg", "gf"],
    "lactose_free": ["sans lactose", "lactose free", "lactose-free", "sl", "lf"],
    "nut_free":     ["sans fruits a coque", "sans fruits à coque", "nut free", "no nuts"],
    "homemade":     ["fait maison", "maison", "homemade"],
    "chef_special": ["plat du chef", "chef special"],
    "traditional":  ["recette traditionnelle", "traditionnel", "traditionnelle"],
    "local_product":["local", "locaux", "régional", "regional", "circuit court", "fermier"],
    "seasonal":     ["de saison", "saisonnier", "saisonnière"],
    "hot_appetizer": ["entrée chaude", "entree chaude", "chaud", "chaude"],
    "spicy":        ["épicé", "epice", "épicée", "epicee", "spicy"],
    "low_salt":     ["peu salé", "peu sale", "faible en sel", "low salt"],
    "sweet_savory": ["sucré-salé", "sucre-sale", "sweet savory"],
}

# ──────────────────────────────────────────────────────────────────────
#  CATÉGORIES DE CERTIFICATIONS
# ──────────────────────────────────────────────────────────────────────

CERTIFICATION_CATEGORIES = [
    {
        "id": "public_official",
        "name": "Labels officiels publics",
        "sort_order": 1,
    },
    {
        "id": "private_certified",
        "name": "Labels privés certifiés",
        "sort_order": 2,
    },
]

# ──────────────────────────────────────────────────────────────────────
#  CERTIFICATIONS  (preuves requises, logos officiels)
# ──────────────────────────────────────────────────────────────────────

CERTIFICATIONS = [
    # ── Labels officiels publics (État / UE) ──
    {
        "id": "ab",
        "name": "AB",
        "official_name": "Agriculture Biologique",
        "issuer": "Ministère de l'Agriculture et de la Souveraineté alimentaire",
        "scheme_type": "public",
        "jurisdiction": "france",
        "guarantee": "Production biologique certifiée",
        "logo_filename": "ab.svg",
        "category_id": "public_official",
        "sort_order": 1,
    },
    {
        "id": "eurofeuille",
        "name": "Eurofeuille",
        "official_name": "Eurofeuille (Bio UE)",
        "issuer": "Commission européenne",
        "scheme_type": "public",
        "jurisdiction": "eu",
        "guarantee": "Conformité bio européenne (Règlement UE 2018/848)",
        "logo_filename": "eurofeuille.svg",
        "category_id": "public_official",
        "sort_order": 2,
    },
    {
        "id": "label_rouge",
        "name": "Label Rouge",
        "official_name": "Label Rouge",
        "issuer": "Institut national de l'origine et de la qualité (INAO)",
        "scheme_type": "public",
        "jurisdiction": "france",
        "guarantee": "Qualité supérieure",
        "logo_filename": "label-rouge.svg",
        "category_id": "public_official",
        "sort_order": 3,
    },
    {
        "id": "aop",
        "name": "AOP",
        "official_name": "Appellation d'Origine Protégée",
        "issuer": "Institut national de l'origine et de la qualité (INAO)",
        "scheme_type": "public",
        "jurisdiction": "eu",
        "guarantee": "Origine et savoir-faire local",
        "logo_filename": "aop.svg",
        "category_id": "public_official",
        "sort_order": 4,
    },
    {
        "id": "igp",
        "name": "IGP",
        "official_name": "Indication Géographique Protégée",
        "issuer": "Institut national de l'origine et de la qualité (INAO)",
        "scheme_type": "public",
        "jurisdiction": "eu",
        "guarantee": "Lien géographique partiel",
        "logo_filename": "igp.svg",
        "category_id": "public_official",
        "sort_order": 5,
    },
    {
        "id": "stg",
        "name": "STG",
        "official_name": "Spécialité Traditionnelle Garantie",
        "issuer": "Commission européenne",
        "scheme_type": "public",
        "jurisdiction": "eu",
        "guarantee": "Recette traditionnelle reconnue",
        "logo_filename": "stg.svg",
        "category_id": "public_official",
        "sort_order": 6,
    },
    {
        "id": "hve",
        "name": "HVE",
        "official_name": "Haute Valeur Environnementale",
        "issuer": "Ministère de l'Agriculture et de la Souveraineté alimentaire",
        "scheme_type": "public",
        "jurisdiction": "france",
        "guarantee": "Performance environnementale d'exploitation",
        "logo_filename": "hve.svg",
        "category_id": "public_official",
        "sort_order": 7,
    },
    # ── Labels privés certifiés ──
    {
        "id": "v_label",
        "name": "V-Label",
        "official_name": "V-Label",
        "issuer": "European Vegetarian Union",
        "scheme_type": "private",
        "jurisdiction": "international",
        "guarantee": "Végétarien / vegan certifié",
        "logo_filename": "v-label.svg",
        "category_id": "private_certified",
        "sort_order": 8,
    },
    {
        "id": "bleu_blanc_coeur",
        "name": "Bleu-Blanc-Cœur",
        "official_name": "Bleu-Blanc-Cœur",
        "issuer": "Bleu-Blanc-Cœur",
        "scheme_type": "private",
        "jurisdiction": "france",
        "guarantee": "Qualité nutritionnelle alimentation animale",
        "logo_filename": "bleu-blanc-coeur.svg",
        "category_id": "private_certified",
        "sort_order": 9,
    },
    {
        "id": "fairtrade",
        "name": "Fairtrade / Max Havelaar",
        "official_name": "Fairtrade / Max Havelaar",
        "issuer": "Fairtrade International",
        "scheme_type": "private",
        "jurisdiction": "international",
        "guarantee": "Commerce équitable",
        "logo_filename": "fairtrade-max-havelaar.svg",
        "category_id": "private_certified",
        "sort_order": 10,
    },
    {
        "id": "msc",
        "name": "MSC",
        "official_name": "Marine Stewardship Council",
        "issuer": "Marine Stewardship Council",
        "scheme_type": "private",
        "jurisdiction": "international",
        "guarantee": "Pêche durable certifiée",
        "logo_filename": "msc.svg",
        "category_id": "private_certified",
        "sort_order": 11,
    },
]

# Mots-clés de détection CSV  (certification_id → liste de mots-clés)
CERTIFICATION_KEYWORDS: dict[str, list[str]] = {
    "ab":                ["ab", "agriculture biologique", "bio", "biologique", "organic", "🌿"],
    "eurofeuille":       ["eurofeuille", "bio ue", "biologique ue", "eu organic"],
    "label_rouge":       ["label rouge"],
    "aop":               ["aop", "appellation d'origine protégée", "appellation d'origine protegee"],
    "igp":               ["igp", "indication géographique protégée", "indication geographique protegee"],
    "stg":               ["stg", "spécialité traditionnelle garantie", "specialite traditionnelle garantie"],
    "hve":               ["hve", "haute valeur environnementale"],
    "v_label":           ["v-label", "v label"],
    "bleu_blanc_coeur":  ["bleu blanc coeur", "bleu-blanc-coeur", "bleu-blanc-cœur"],
    "fairtrade":         ["fairtrade", "max havelaar", "commerce équitable", "commerce equitable"],
    "msc":               ["msc", "marine stewardship", "pêche durable", "peche durable", "🐟"],
}


# ──────────────────────────────────────────────────────────────────────
#  TAGS & CERTIFICATIONS ACTIVÉS PAR DÉFAUT
# ──────────────────────────────────────────────────────────────────────

DEFAULT_ENABLED_TAG_IDS: set[str] = {
    "vegetarian",     # Végétarien
    "pork_free",      # Sans porc
    "gluten_free",    # Sans gluten
    "homemade",       # Fait maison
    "chef_special",   # Plat du chef
    "local_product",  # Produit local
    "seasonal",       # Produit de saison
}

DEFAULT_ENABLED_CERT_IDS: set[str] = {
    "ab",                 # Agriculture Biologique
    "eurofeuille",        # Bio UE
    "label_rouge",        # Label Rouge
    "hve",                # Haute Valeur Environnementale
    "v_label",            # V-Label
    "bleu_blanc_coeur",   # Bleu-Blanc-Cœur
}


# ──────────────────────────────────────────────────────────────────────
#  HELPERS (utilisés côté serveur)
# ──────────────────────────────────────────────────────────────────────

def get_tag_by_id(tag_id: str) -> dict | None:
    """Retourne un tag par son identifiant."""
    return next((t for t in DIETARY_TAGS if t["id"] == tag_id), None)


def get_certification_by_id(cert_id: str) -> dict | None:
    """Retourne une certification par son identifiant."""
    return next((c for c in CERTIFICATIONS if c["id"] == cert_id), None)


def get_all_tag_ids() -> set[str]:
    """Retourne l'ensemble de tous les identifiants de tags."""
    return {t["id"] for t in DIETARY_TAGS}


def get_all_certification_ids() -> set[str]:
    """Retourne l'ensemble de tous les identifiants de certifications."""
    return {c["id"] for c in CERTIFICATIONS}
