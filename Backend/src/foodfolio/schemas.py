"""Request/response shapes and the schema the model must fill in.

Units and departments mirror `constants/recipeConstants.js` in the app. Keep the
two in sync: the app shows exactly the strings returned here.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

UNITS = (
    "מיליליטר",
    "ליטר",
    "מיליגרם",
    "גרם",
    "קילוגרם",
    "כוס",
    "כף",
    "כפית",
    "יחידה",
    "קורט",
    "שן",
    "צרור",
    "חבילה",
    "קופסה",
    "פרוסה",
)
DEPARTMENTS = (
    "פירות וירקות",
    "בשר ועוף",
    "דגים",
    "תבלינים",
    "מוצרי חלב וביצים",
    "ממרחים",
    "קפה ותה",
    "ממתקים",
    "אלכוהול",
    "שימורים",
    "לחם",
    "יבשים ואפייה",
    "שמנים ורטבים",
    "אחר",
)

# Strict structured outputs forbid a double quote inside an enum value, so the model
# writes these units in full and we return the abbreviations the app stores.
APP_UNIT = {"מיליליטר": 'מ"ל', "מיליגרם": 'מ"ג', "קילוגרם": 'ק"ג'}
Unit = Literal[*UNITS]  # what the model may write
AppUnit = Literal[*(APP_UNIT.get(u, u) for u in UNITS)]  # what the app receives
Department = Literal[*DEPARTMENTS]


# --- What the model returns -------------------------------------------------
# Kept free of numeric constraints and defaults: strict structured outputs only
# accept plain required fields. Bounds are enforced afterwards in `service.py`.


class ModelIngredient(BaseModel):
    name: str
    quantity: float
    unit: Unit
    department: Department
    estimated: bool  # True when the quantity is not stated in the source
    optional: bool  # the source marks it optional ("אופציונלי", "לפי הטעם להגשה")


class ModelRecipe(BaseModel):
    is_recipe: bool
    title: str
    servings: int
    total_minutes: int | None
    ingredients: list[ModelIngredient]
    steps: list[str]
    tags: list[str]
    fridge_days: int | None
    suggested_category: str | None


# --- API ---------------------------------------------------------------------


class UrlImport(BaseModel):
    type: Literal["url"]
    url: Annotated[str, Field(min_length=8, max_length=2048)]
    # Text the other app shared along with the link (an Instagram or TikTok caption).
    text: Annotated[str, Field(max_length=30_000)] | None = None
    categories: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=30
    )


Base64Image = Annotated[str, Field(min_length=100)]  # base64 JPEG/PNG


class ImageImport(BaseModel):
    """A photo of a recipe, or up to 4 screenshots of one post (caption, comments...)."""

    type: Literal["image"]
    image: Base64Image | None = None
    images: list[Base64Image] = Field(default_factory=list, max_length=4)
    categories: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=30
    )

    @model_validator(mode="after")
    def _has_an_image(self):
        if not self.image and not self.images:
            raise ValueError("image or images is required")
        return self

    @property
    def all_images(self) -> list[str]:
        return ([self.image] if self.image else []) + self.images


class HtmlImport(BaseModel):
    """A page the phone fetched itself, for sites that refuse requests from data centres."""

    type: Literal["html"]
    url: Annotated[str, Field(min_length=8, max_length=2048)]
    html: Annotated[str, Field(min_length=100, max_length=2_000_000)]
    # Text the other app shared along with the link (an Instagram or TikTok caption).
    text: Annotated[str, Field(max_length=30_000)] | None = None
    categories: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=30
    )


class TextImport(BaseModel):
    """Recipe text pasted by the person (a caption, a message, a copied page)."""

    type: Literal["text"]
    text: Annotated[str, Field(min_length=20, max_length=30_000)]
    categories: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=30
    )


class PdfImport(BaseModel):
    """A PDF shared into the app: FoodFolio's own recipe book, or any recipe PDF."""

    pdf: Annotated[str, Field(min_length=100, max_length=6_000_000)]  # base64
    categories: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=30
    )


ImportRequest = Annotated[
    UrlImport | ImageImport | HtmlImport | TextImport, Field(discriminator="type")
]


class Ingredient(BaseModel):
    name: str
    quantity: float
    unit: AppUnit
    department: Department
    estimated: bool = False
    optional: bool = False


class Recipe(BaseModel):
    title: str
    servings: int
    total_minutes: int | None
    ingredients: list[Ingredient]
    steps: list[str]
    tags: list[str]
    fridge_days: int | None
    suggested_category: str | None
    # Only set for recipes read back from a FoodFolio PDF.
    total_time: str | None = None
    source_url: str | None = None


# --- Substitutions -----------------------------------------------------------


class SubstituteRequest(BaseModel):
    ingredient: Annotated[str, Field(min_length=1, max_length=80)]
    quantity: Annotated[float, Field(gt=0, lt=100_000)]
    unit: Annotated[str, Field(max_length=20)]
    recipe_title: Annotated[str, Field(max_length=120)] = ""
    other_ingredients: list[Annotated[str, Field(max_length=80)]] = Field(
        default_factory=list, max_length=40
    )
    # The household's dietary preferences in words ("צמחוני", "אלרגיה לאגוזים").
    constraints: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=12
    )


class ModelSubstitute(BaseModel):
    name: str
    quantity: float
    unit: Unit
    note: str


class ModelSubstitutes(BaseModel):
    options: list[ModelSubstitute]


class Substitute(BaseModel):
    name: str
    quantity: float
    unit: AppUnit
    note: str
