# A spreadsheet runs as a formula any cell that starts with one of these.
FORMULA_LEADS = ('=', '+', '-', '@', '\t', '\r')


def safe_cell(value) -> str:
    text = str(value)
    return f"'{text}" if text.startswith(FORMULA_LEADS) else text
