# A spreadsheet runs as a formula any cell that starts with one of these.
FORMULA_LEADS = ('=', '+', '-', '@', '\t', '\r')


def safe_cell(value) -> str:
    text = str(value)
    return f"'{text}" if text.startswith(FORMULA_LEADS) else text


def read_cell(text: str) -> str:
    """A cell as `safe_cell` wrote it, read back as it was typed."""
    guarded = text.startswith("'") and text[1:].startswith(FORMULA_LEADS)
    return text[1:] if guarded else text
