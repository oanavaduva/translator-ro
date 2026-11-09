# -*- coding: utf-8 -*-
"""
Generator: Tracker oferte - parteneri rezidentiali (Effect Creative / WoodClass / Carpathian Floor)

Ruleaza:  python3 genereaza_tracker.py [cale_iesire.xlsx]
Rezultat: Tracker_Oferte_Rezidential_2026-11-09.xlsx (compatibil Google Sheets)

Reguli de compatibilitate respectate:
- fara macro-uri, fara Excel Tables / structured references, fara functii noi
  (XLOOKUP, FILTER, LET, MAXIFS, dynamic arrays);
- doar IF, IFERROR, AND, OR, N, LEFT, INDEX/MATCH, VLOOKUP, SUMIFS, COUNTIFS,
  SUMPRODUCT, MAX, TODAY, EOMONTH, YEAR, MONTH, NETWORKDAYS;
- dropdown-uri prin Data Validation care refera foaia "Liste" (intervale extinse).
"""
import sys
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.chart import BarChart, Reference

OUT = sys.argv[1] if len(sys.argv) > 1 else \
    "/home/user/translator-ro/tracker-oferte/Tracker_Oferte_Rezidential_2026-11-09.xlsx"

N = 500            # randuri de date pe foile Clienti / Oferte / Mostre / Preturi
LAST = N + 1       # ultimul rand de date (antet pe randul 1)
JN = 3000          # randuri in Jurnal (se completeaza zilnic)
JLAST = JN + 1
LIST_LAST = 100    # listele din "Liste" sunt citite pana la randul 100

# Nume foi (cu ghilimele pentru formule)
S_INS, S_CL, S_OF, S_MO, S_PR, S_JU, S_FC, S_LI = (
    "Instrucțiuni", "Clienți", "Oferte & Proiecte", "Mostre",
    "Prețuri speciale", "Jurnal activitate", "Forecast", "Liste")
Q = lambda s: "'" + s + "'"

# ---------------------------------------------------------------- stiluri
C_HDR = "1F4E3D"      # verde inchis (coloane de completat)
C_HDR_AUTO = "6E6E6E" # gri inchis (coloane calculate)
C_AUTO = "EDEDED"     # fundal gri deschis pentru celulele (auto)
F_HDR = Font(bold=True, color="FFFFFF", size=10)
FILL_HDR = PatternFill("solid", fgColor=C_HDR)
FILL_HDR_AUTO = PatternFill("solid", fgColor=C_HDR_AUTO)
FILL_AUTO = PatternFill("solid", fgColor=C_AUTO)
AL_HDR = Alignment(wrap_text=True, vertical="center", horizontal="center")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

FMT_DATE = "dd.mm.yyyy"
FMT_MONEY = "#,##0.00"
FMT_PCT = "0%"
FMT_INT = "0"

# ---------------------------------------------------------------- liste
LISTE = [
    ("tip_partener", "Tip partener", ["Constructor", "Dezvoltator imobiliar", "Arhitect / Designer",
                                      "Montator", "Client final (proiect propriu)",
                                      "Distribuitor / Magazin", "Altul"]),
    ("sursa", "Sursă lead", ["Showroom", "Recomandare", "Site", "Telefon", "Email", "Târg",
                             "Social media", "Agent", "Altul"]),
    ("resp", "Responsabil", ["Roxana", "Oana"]),
    ("tip_proiect", "Tip proiect", ["Casă individuală", "Bloc/ansamblu rezidențial", "Apartament",
                                    "Renovare", "Vilă/premium", "Altul"]),
    ("etapa", "Etapă șantier", ["Proiectare", "Structură", "Instalații", "Finisaje", "Finalizat"]),
    ("brand", "Brand", ["WoodClass", "Carpathian Floor", "Effect Creative", "Mixt"]),
    ("familii", "Familii produse", ["Plinte polimer", "Plinte MDF", "Baghete/cornișe (incl. LED)",
                                    "Riflaje", "Praguri aluminiu", "Profile plăci ceramice",
                                    "Protecții treaptă", "Profile inox", "Pardoseală SPC TANIN",
                                    "Plăci perete SPC CALCITA", "Altele/mix"]),
    ("um", "UM", ["mp", "ml", "buc", "set"]),
    ("danu", "Da/Nu", ["Da", "Nu"]),
    ("status", "Status", ["1-Cerere nouă (fără răspuns)", "2-În lucru", "3-Ofertă trimisă",
                          "4-Negociere", "5-Câștigat", "6-Pierdut", "7-Amânat"]),
    ("prob", "Probabilitate status", [0.10, 0.20, 0.40, 0.60, 1.00, 0.00, 0.10]),
    ("motiv", "Motiv pierdere", ["Preț", "Termen livrare", "A ales concurența",
                                 "Proiect amânat/anulat", "Fără răspuns client",
                                 "Specificație tehnică", "Altul"]),
    ("canal", "Canal", ["Telefon", "Email", "WhatsApp", "Vizită șantier", "Întâlnire showroom",
                        "Videocall"]),
    ("directie", "Direcție", ["Intrat", "Ieșit"]),
    ("rezultat", "Rezultat", ["Interesat", "Cere ofertă", "Cere mostre", "Negociere",
                              "Comandă confirmată", "Nu răspunde", "Nu e interesat", "Revine el"]),
    ("livrare", "Mod livrare", ["Curier", "Personal", "Showroom", "Poștă"]),
    ("primita", "Primită de client?", ["Da", "Nu", "Neconfirmat"]),
    ("aprobat", "Aprobat de", ["Oana"]),
]
LCOL = {key: get_column_letter(i + 1) for i, (key, _, _) in enumerate(LISTE)}


def lref(key):
    """Interval absolut din Liste pentru dropdown (extins pana la randul LIST_LAST)."""
    c = LCOL[key]
    return f"{Q(S_LI)}!${c}$2:${c}${LIST_LAST}"


# ---------------------------------------------------------------- utilitare
def build_cols(spec):
    """spec: lista (cheie, antet, latime, auto, format). Intoarce dict cheie->litera."""
    return {k: get_column_letter(i + 1) for i, (k, *_r) in enumerate(spec)}


def setup_sheet(ws, spec, last_row, tab_color=None):
    for i, (key, hdr, width, auto, fmt) in enumerate(spec, start=1):
        col = get_column_letter(i)
        cell = ws.cell(row=1, column=i, value=hdr + (" (auto)" if auto else ""))
        cell.font = F_HDR
        cell.fill = FILL_HDR_AUTO if auto else FILL_HDR
        cell.alignment = AL_HDR
        cell.border = BORDER
        ws.column_dimensions[col].width = width
        if auto or fmt:
            for r in range(2, last_row + 1):
                c = ws.cell(row=r, column=i)
                if auto:
                    c.fill = FILL_AUTO
                if fmt:
                    c.number_format = fmt
    ws.row_dimensions[1].height = 48
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(spec))}{last_row}"
    if tab_color:
        ws.sheet_properties.tabColor = tab_color


def add_list_dv(ws, key, rng, prompt=None):
    dv = DataValidation(type="list", formula1=lref(key), allow_blank=True,
                        showErrorMessage=True, errorStyle="stop",
                        errorTitle="Valoare invalidă",
                        error="Alegeți o valoare din listă (lista se editează în foaia „Liste”).")
    if prompt:
        dv.showInputMessage = True
        dv.prompt = prompt
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def add_ref_dv(ws, formula, rng, what):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True,
                        showErrorMessage=True, errorStyle="stop",
                        errorTitle="ID inexistent",
                        error=f"Alegeți un {what} existent. Dacă nu există, adăugați-l întâi în foaia lui.")
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def add_date_dv(ws, rng):
    dv = DataValidation(type="date", operator="greaterThan", formula1="DATE(2020,1,1)",
                        allow_blank=True, showErrorMessage=True, errorStyle="stop",
                        errorTitle="Dată invalidă",
                        error="Introduceți o dată calendaristică (ex. 09.11.2026), nu text.")
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def add_pct_dv(ws, rng):
    dv = DataValidation(type="decimal", operator="between", formula1="0", formula2="100",
                        allow_blank=True, showErrorMessage=True, errorStyle="stop",
                        errorTitle="Procent invalid",
                        error="Introduceți un procent între 0% și 100% (ex. 50% sau 50).")
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def fill(color):
    return PatternFill("solid", fgColor=color, bgColor=color)


wb = Workbook()

# =====================================================================
# 8. LISTE (construita prima ca referinta; mutata la final in ordine)
# =====================================================================
wsL = wb.active
wsL.title = S_LI
for i, (key, hdr, vals) in enumerate(LISTE, start=1):
    c = wsL.cell(row=1, column=i, value=hdr)
    c.font = F_HDR
    c.fill = FILL_HDR
    c.alignment = AL_HDR
    for r, v in enumerate(vals, start=2):
        cell = wsL.cell(row=r, column=i, value=v)
        if key == "prob":
            cell.number_format = FMT_PCT
    wsL.column_dimensions[get_column_letter(i)].width = 24
wsL.row_dimensions[1].height = 36
wsL.freeze_panes = "A2"
nota_col = len(LISTE) + 2
wsL.cell(row=1, column=nota_col, value="Notă").font = Font(bold=True)
wsL.cell(row=2, column=nota_col, value=(
    "Adăugați valori noi în prima celulă goală sub fiecare listă (până la rândul 100) - "
    "apar automat în dropdown-uri. Nu lăsați rânduri goale la mijlocul listei. "
    "Coloana „Probabilitate status” se citește pe același rând cu „Status”: "
    "dacă adăugați un status nou, scrieți și probabilitatea lui alături. "
    "Nu redenumiți statusurile existente: formulele se bazează pe cifra de la început (1-…7-)."))
wsL.cell(row=2, column=nota_col).alignment = Alignment(wrap_text=True, vertical="top")
wsL.column_dimensions[get_column_letter(nota_col)].width = 60
wsL.sheet_properties.tabColor = "808080"

# =====================================================================
# 2. CLIENTI
# =====================================================================
wsC = wb.create_sheet(S_CL)
CL_SPEC = [
    ("id", "ID client", 11, False, None),
    ("firma", "Firmă / Nume", 30, False, None),
    ("tip", "Tip partener", 20, False, None),
    ("cui", "CUI (opțional)", 13, False, None),
    ("contact", "Persoană contact", 22, False, None),
    ("functie", "Funcție", 16, False, None),
    ("tel", "Telefon", 15, False, "@"),
    ("email", "Email", 26, False, None),
    ("oras", "Oraș", 15, False, None),
    ("judet", "Județ", 13, False, None),
    ("sursa", "Sursă lead", 15, False, None),
    ("resp", "Responsabil", 13, False, None),
    ("data", "Data adăugării", 13, False, FMT_DATE),
    ("nr_of", "Nr. oferte", 10, True, FMT_INT),
    ("val_of", "Valoare totală ofertată (RON)", 15, True, FMT_MONEY),
    ("val_cs", "Valoare câștigată (RON)", 15, True, FMT_MONEY),
    ("obs", "Observații", 34, False, None),
]
CC = build_cols(CL_SPEC)
setup_sheet(wsC, CL_SPEC, LAST, "1F4E3D")

# =====================================================================
# 3. OFERTE & PROIECTE
# =====================================================================
wsO = wb.create_sheet(S_OF)
OF_SPEC = [
    ("id", "ID ofertă", 12, False, None),
    ("dc", "Data cererii", 12, False, FMT_DATE),
    ("idc", "ID client", 11, False, None),
    ("client", "Client", 26, True, None),
    ("contact", "Persoană contact", 20, True, None),
    ("tel", "Telefon", 14, True, None),
    ("email", "Email", 24, True, None),
    ("proiect", "Nume proiect", 24, False, None),
    ("adresa", "Adresă șantier", 28, False, None),
    ("oras", "Oraș / Județ șantier", 18, False, None),
    ("tipp", "Tip proiect", 18, False, None),
    ("etapa", "Etapă șantier", 13, False, None),
    ("brand", "Brand", 15, False, None),
    ("familii", "Familii produse", 22, False, None),
    ("produse", "Produse ofertate (coduri + cantități)", 34, False, None),
    ("cant", "Cantitate estimată", 11, False, "#,##0.##"),
    ("um", "UM", 7, False, None),
    ("val", "Valoare ofertă fără TVA (RON)", 15, False, FMT_MONEY),
    ("ps", "Preț special acordat?", 11, False, None),
    ("disc", "Discount mediu %", 10, False, FMT_PCT),
    ("dt", "Data trimiterii ofertei", 13, False, FMT_DATE),
    ("vp", "Ofertă valabilă până la", 13, False, FMT_DATE),
    ("mostre", "Mostre trimise?", 10, True, None),
    ("st", "Status", 24, False, None),
    ("pa", "Probabilitate % după status", 12, True, FMT_PCT),
    ("pm", "Probabilitate manuală % (opțional)", 13, False, FMT_PCT),
    ("pf", "Probabilitate folosită %", 12, True, FMT_PCT),
    ("da", "Data estimată achiziție", 13, False, FMT_DATE),
    ("luna", "Luna achiziției (AAAA-LL)", 11, True, None),
    ("vpd", "Valoare ponderată (RON)", 15, True, FMT_MONEY),
    ("zf", "Zile lucrătoare fără răspuns", 11, True, FMT_INT),
    ("uc", "Ultimul contact (din Jurnal)", 13, True, FMT_DATE),
    ("up", "Următorul pas", 28, False, None),
    ("dup", "Data următorului pas", 13, False, FMT_DATE),
    ("al", "ALERTĂ", 28, True, None),
    ("motiv", "Motiv pierdere", 18, False, None),
    ("conc", "Concurent", 16, False, None),
    ("resp", "Responsabil", 13, False, None),
    ("obs", "Observații", 34, False, None),
]
OC = build_cols(OF_SPEC)
setup_sheet(wsO, OF_SPEC, LAST, "C00000")

# =====================================================================
# 4. MOSTRE
# =====================================================================
wsM = wb.create_sheet(S_MO)
MO_SPEC = [
    ("id", "ID mostră", 10, False, None),
    ("data", "Data trimiterii", 12, False, FMT_DATE),
    ("idof", "ID ofertă", 12, False, None),
    ("client", "Client", 26, True, None),
    ("idc", "ID client", 11, True, None),
    ("produs", "Produs / cod", 22, False, None),
    ("decor", "Decor / culoare", 18, False, None),
    ("cant", "Cantitate (buc)", 10, False, FMT_INT),
    ("livrare", "Mod livrare", 12, False, None),
    ("awb", "AWB", 16, False, "@"),
    ("primita", "Primită de client?", 12, False, None),
    ("feedback", "Feedback client", 34, False, None),
    ("dfu", "Data follow-up mostră", 13, False, FMT_DATE),
    ("al", "Alertă", 20, True, None),
    ("resp", "Responsabil", 13, False, None),
    ("obs", "Observații", 30, False, None),
]
MC = build_cols(MO_SPEC)
setup_sheet(wsM, MO_SPEC, LAST, "7F6000")

# =====================================================================
# 5. PRETURI SPECIALE
# =====================================================================
wsP = wb.create_sheet(S_PR)
PR_SPEC = [
    ("idof", "ID ofertă", 12, False, None),
    ("client", "Client", 26, True, None),
    ("cod", "Cod produs", 14, False, None),
    ("den", "Denumire produs", 30, False, None),
    ("um", "UM", 7, False, None),
    ("pl", "Preț listă fără TVA (RON)", 13, False, FMT_MONEY),
    ("ps", "Preț special fără TVA (RON)", 13, False, FMT_MONEY),
    ("disc", "Discount %", 10, True, "0.0%"),
    ("cmin", "Cantitate minimă", 10, False, "#,##0.##"),
    ("vp", "Valabil până la", 13, False, FMT_DATE),
    ("stp", "Status preț", 11, True, None),
    ("apr", "Aprobat de", 12, False, None),
    ("cond", "Condiții (plată, livrare)", 30, False, None),
    ("obs", "Observații", 30, False, None),
]
PC = build_cols(PR_SPEC)
setup_sheet(wsP, PR_SPEC, LAST, "2F5597")

# =====================================================================
# 6. JURNAL ACTIVITATE
# =====================================================================
wsJ = wb.create_sheet(S_JU)
JU_SPEC = [
    ("data", "Data", 12, False, FMT_DATE),
    ("resp", "Responsabil", 13, False, None),
    ("idc", "ID client", 11, False, None),
    ("client", "Client", 26, True, None),
    ("idof", "ID ofertă (opțional)", 12, False, None),
    ("canal", "Canal", 16, False, None),
    ("dir", "Direcție", 9, False, None),
    ("subiect", "Subiect / rezumat", 40, False, None),
    ("produse", "Produse discutate", 24, False, None),
    ("rez", "Rezultat", 18, False, None),
    ("up", "Următorul pas", 28, False, None),
    ("dup", "Data următorului pas", 13, False, FMT_DATE),
]
JC = build_cols(JU_SPEC)
setup_sheet(wsJ, JU_SPEC, JLAST, "548235")

# ---------------------------------------------------------------- intervale absolute
def rng(sheet, col, last=LAST):
    return f"{Q(sheet)}!${col}$2:${col}${last}"

O = {k: rng(S_OF, c) for k, c in OC.items()}
CLR = {k: rng(S_CL, c) for k, c in CC.items()}
MOR = {k: rng(S_MO, c) for k, c in MC.items()}
JUR = {k: rng(S_JU, c, JLAST) for k, c in JC.items()}
ACTIVE = ["1-*", "2-*", "3-*", "4-*", "7-*"]   # statusuri active in pipeline

# ---------------------------------------------------------------- formule CLIENTI
for r in range(2, LAST + 1):
    wsC[f"{CC['id']}{r}"] = f"CL-{r-1:04d}"
    k = f"{CC['firma']}{r}"
    a = f"{CC['id']}{r}"
    wsC[f"{CC['nr_of']}{r}"] = f'=IF({k}="","",COUNTIFS({O["idc"]},{a}))'
    wsC[f"{CC['val_of']}{r}"] = f'=IF({k}="","",SUMIFS({O["val"]},{O["idc"]},{a}))'
    wsC[f"{CC['val_cs']}{r}"] = f'=IF({k}="","",SUMIFS({O["val"]},{O["idc"]},{a},{O["st"]},"5-*"))'

add_list_dv(wsC, "tip_partener", f"{CC['tip']}2:{CC['tip']}{LAST}")
add_list_dv(wsC, "sursa", f"{CC['sursa']}2:{CC['sursa']}{LAST}")
add_list_dv(wsC, "resp", f"{CC['resp']}2:{CC['resp']}{LAST}")
add_date_dv(wsC, f"{CC['data']}2:{CC['data']}{LAST}")

# ---------------------------------------------------------------- formule OFERTE
def lookup_client(field, idcell):
    return (f'IFERROR(INDEX({CLR[field]},MATCH({idcell},{CLR["id"]},0))&"","")')


for r in range(2, LAST + 1):
    c = {k: f"{v}{r}" for k, v in OC.items()}
    wsO[c["id"]] = f"OF-2026-{r-1:03d}"
    s = f'LEFT({c["st"]},1)'
    wsO[c["client"]] = f'=IF({c["idc"]}="","",{lookup_client("firma", c["idc"])})'
    wsO[c["contact"]] = f'=IF({c["idc"]}="","",{lookup_client("contact", c["idc"])})'
    wsO[c["tel"]] = f'=IF({c["idc"]}="","",{lookup_client("tel", c["idc"])})'
    wsO[c["email"]] = f'=IF({c["idc"]}="","",{lookup_client("email", c["idc"])})'
    wsO[c["mostre"]] = (f'=IF({c["dc"]}="","",IF(COUNTIFS({MOR["idof"]},{c["id"]})>0,"Da","Nu"))')
    wsO[c["pa"]] = (f'=IF({c["st"]}="","",IFERROR(VLOOKUP({c["st"]},'
                    f'{Q(S_LI)}!${LCOL["status"]}$2:${LCOL["prob"]}${LIST_LAST},2,FALSE),""))')
    wsO[c["pf"]] = (f'=IF({c["st"]}="","",IF({c["pm"]}<>"",IF({c["pm"]}>1,{c["pm"]}/100,{c["pm"]}),{c["pa"]}))')
    wsO[c["luna"]] = (f'=IF(N({c["da"]})=0,"",YEAR({c["da"]})&"-"&IF(MONTH({c["da"]})<10,"0","")&MONTH({c["da"]}))')
    wsO[c["vpd"]] = (f'=IF(OR({c["val"]}="",{c["pf"]}=""),"",{c["val"]}*{c["pf"]})')
    wsO[c["zf"]] = (f'=IF(N({c["dc"]})=0,"",IF(OR({s}="1",AND(N({c["dt"]})=0,{s}<>"5",{s}<>"6")),'
                    f'MAX(0,NETWORKDAYS({c["dc"]},TODAY())-1),""))')
    wsO[c["uc"]] = (f'=IF({c["dc"]}="","",IFERROR(1/(1/SUMPRODUCT(MAX(({JUR["idof"]}={c["id"]})*{JUR["data"]}))),""))')
    last_touch = f'MAX(N({c["uc"]}),N({c["dt"]}))'
    act34 = f'OR({s}="3",{s}="4")'
    wsO[c["al"]] = (
        f'=IF({c["dc"]}="","",'
        f'IF(N({c["zf"]})>=2,"NERĂSPUNS – "&{c["zf"]}&" zile",'
        f'IF(AND(N({c["dup"]})>0,N({c["dup"]})<TODAY(),{s}<>"5",{s}<>"6"),"FOLLOW-UP ÎNTÂRZIAT",'
        f'IF(AND(N({c["vp"]})>0,{act34},N({c["vp"]})<TODAY()),"OFERTĂ EXPIRATĂ",'
        f'IF(AND(N({c["vp"]})>0,{act34},N({c["vp"]})-TODAY()<7),"OFERTĂ EXPIRĂ ÎN <7 ZILE",'
        f'IF(AND({act34},{last_touch}>0,TODAY()-{last_touch}>14),"FĂRĂ CONTACT 14+ ZILE",""))))))')

add_ref_dv(wsO, f"{Q(S_CL)}!${CC['id']}$2:${CC['id']}${LAST}", f"{OC['idc']}2:{OC['idc']}{LAST}", "ID client")
for key, lk in [("tipp", "tip_proiect"), ("etapa", "etapa"), ("brand", "brand"), ("familii", "familii"),
                ("um", "um"), ("ps", "danu"), ("st", "status"), ("motiv", "motiv"), ("resp", "resp")]:
    add_list_dv(wsO, lk, f"{OC[key]}2:{OC[key]}{LAST}")
for key in ["dc", "dt", "vp", "da", "dup"]:
    add_date_dv(wsO, f"{OC[key]}2:{OC[key]}{LAST}")
add_pct_dv(wsO, f"{OC['pm']}2:{OC['pm']}{LAST}")
add_pct_dv(wsO, f"{OC['disc']}2:{OC['disc']}{LAST}")

# Formatare conditionala pe rand (ordinea = prioritatea; prima regula potrivita castiga)
last_col_O = get_column_letter(len(OF_SPEC))
area = f"A2:{last_col_O}{LAST}"
AL2 = f"${OC['al']}2"
ST2 = f"${OC['st']}2"
# Rand cu data cererii dar fara status -> marcheaza celula Status
wsO.conditional_formatting.add(f"{OC['st']}2:{OC['st']}{LAST}", FormulaRule(
    formula=[f'AND(${OC["dc"]}2<>"",{OC["st"]}2="")'], fill=fill("FF0000"), font=Font(bold=True, color="FFFFFF"), stopIfTrue=True))

wsO.conditional_formatting.add(area, FormulaRule(
    formula=[f'LEFT({AL2},9)="NERĂSPUNS"'], fill=fill("F8CBAD"), stopIfTrue=True))
wsO.conditional_formatting.add(area, FormulaRule(
    formula=[f'OR({AL2}="FOLLOW-UP ÎNTÂRZIAT",LEFT({AL2},6)="OFERTĂ")'], fill=fill("FFD9A0"), stopIfTrue=True))
wsO.conditional_formatting.add(area, FormulaRule(
    formula=[f'{AL2}="FĂRĂ CONTACT 14+ ZILE"'], fill=fill("FFF2CC"), stopIfTrue=True))
wsO.conditional_formatting.add(area, FormulaRule(
    formula=[f'LEFT({ST2},1)="5"'], fill=fill("C6EFCE"), stopIfTrue=True))
wsO.conditional_formatting.add(area, FormulaRule(
    formula=[f'LEFT({ST2},1)="6"'], fill=fill("D9D9D9"), font=Font(color="7F7F7F"), stopIfTrue=True))
# Textul alertei: rosu ingrosat
wsO.conditional_formatting.add(f"{OC['al']}2:{OC['al']}{LAST}", FormulaRule(
    formula=[f'{OC["al"]}2<>""'], font=Font(bold=True, color="C00000")))
# ---------------------------------------------------------------- formule MOSTRE
for r in range(2, LAST + 1):
    c = {k: f"{v}{r}" for k, v in MC.items()}
    wsM[c["id"]] = f"M-{r-1:03d}"
    wsM[c["client"]] = (f'=IF({c["idof"]}="","",IFERROR(INDEX({O["client"]},MATCH({c["idof"]},{O["id"]},0))&"",""))')
    wsM[c["idc"]] = (f'=IF({c["idof"]}="","",IFERROR(INDEX({O["idc"]},MATCH({c["idof"]},{O["id"]},0))&"",""))')
    wsM[c["al"]] = (f'=IF(N({c["data"]})=0,"",IF(AND(N({c["dfu"]})>0,N({c["dfu"]})<=TODAY(),'
                    f'{c["feedback"]}=""),"FOLLOW-UP MOSTRĂ",""))')
add_ref_dv(wsM, f"{Q(S_OF)}!${OC['id']}$2:${OC['id']}${LAST}", f"{MC['idof']}2:{MC['idof']}{LAST}", "ID ofertă")
add_list_dv(wsM, "livrare", f"{MC['livrare']}2:{MC['livrare']}{LAST}")
add_list_dv(wsM, "primita", f"{MC['primita']}2:{MC['primita']}{LAST}")
add_list_dv(wsM, "resp", f"{MC['resp']}2:{MC['resp']}{LAST}")
add_date_dv(wsM, f"{MC['data']}2:{MC['data']}{LAST}")
add_date_dv(wsM, f"{MC['dfu']}2:{MC['dfu']}{LAST}")
wsM.conditional_formatting.add(f"A2:{get_column_letter(len(MO_SPEC))}{LAST}", FormulaRule(
    formula=[f'${MC["al"]}2="FOLLOW-UP MOSTRĂ"'], fill=fill("FFD9A0")))

# ---------------------------------------------------------------- formule PRETURI SPECIALE
for r in range(2, LAST + 1):
    c = {k: f"{v}{r}" for k, v in PC.items()}
    wsP[c["client"]] = (f'=IF({c["idof"]}="","",IFERROR(INDEX({O["client"]},MATCH({c["idof"]},{O["id"]},0))&"",""))')
    wsP[c["disc"]] = (f'=IF(OR(N({c["pl"]})=0,{c["ps"]}=""),"",1-{c["ps"]}/{c["pl"]})')
    wsP[c["stp"]] = (f'=IF({c["ps"]}="","",IF(N({c["vp"]})=0,"Activ",IF(N({c["vp"]})<TODAY(),"Expirat","Activ")))')
add_ref_dv(wsP, f"{Q(S_OF)}!${OC['id']}$2:${OC['id']}${LAST}", f"{PC['idof']}2:{PC['idof']}{LAST}", "ID ofertă")
add_list_dv(wsP, "um", f"{PC['um']}2:{PC['um']}{LAST}")
add_list_dv(wsP, "aprobat", f"{PC['apr']}2:{PC['apr']}{LAST}")
add_date_dv(wsP, f"{PC['vp']}2:{PC['vp']}{LAST}")
wsP.conditional_formatting.add(f"A2:{get_column_letter(len(PR_SPEC))}{LAST}", FormulaRule(
    formula=[f'${PC["stp"]}2="Expirat"'], fill=fill("D9D9D9"), font=Font(color="7F7F7F")))
wsP.conditional_formatting.add(f"{PC['apr']}2:{PC['apr']}{LAST}", FormulaRule(
    formula=[f'AND(${PC["ps"]}2<>"",{PC["apr"]}2="")'], fill=fill("FFD9A0")))

# ---------------------------------------------------------------- formule JURNAL
for r in range(2, JLAST + 1):
    c = {k: f"{v}{r}" for k, v in JC.items()}
    wsJ[c["client"]] = (
        f'=IF({c["idc"]}<>"",{lookup_client("firma", c["idc"])},'
        f'IF({c["idof"]}<>"",IFERROR(INDEX({O["client"]},MATCH({c["idof"]},{O["id"]},0))&"",""),""))')
add_list_dv(wsJ, "resp", f"{JC['resp']}2:{JC['resp']}{JLAST}")
add_ref_dv(wsJ, f"{Q(S_CL)}!${CC['id']}$2:${CC['id']}${LAST}", f"{JC['idc']}2:{JC['idc']}{JLAST}", "ID client")
add_ref_dv(wsJ, f"{Q(S_OF)}!${OC['id']}$2:${OC['id']}${LAST}", f"{JC['idof']}2:{JC['idof']}{JLAST}", "ID ofertă")
add_list_dv(wsJ, "canal", f"{JC['canal']}2:{JC['canal']}{JLAST}")
add_list_dv(wsJ, "directie", f"{JC['dir']}2:{JC['dir']}{JLAST}")
add_list_dv(wsJ, "rezultat", f"{JC['rez']}2:{JC['rez']}{JLAST}")
add_date_dv(wsJ, f"{JC['data']}2:{JC['data']}{JLAST}")
add_date_dv(wsJ, f"{JC['dup']}2:{JC['dup']}{JLAST}")

# =====================================================================
# 7. FORECAST
# =====================================================================
wsF = wb.create_sheet(S_FC)
wsF.sheet_properties.tabColor = "FFC000"
for col, w in zip("ABCDEFG", [34, 14, 12, 18, 18, 18, 4]):
    wsF.column_dimensions[col].width = w
F_T = Font(bold=True, size=14, color=C_HDR)
F_S = Font(bold=True, size=11, color=C_HDR)


def hdr_row(ws, row, labels):
    for i, lab in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=lab)
        c.font = F_HDR
        c.fill = FILL_HDR_AUTO
        c.alignment = AL_HDR
        c.border = BORDER
    ws.row_dimensions[row].height = 32


def auto_cell(ws, ref, value, fmt=None):
    ws[ref] = value
    ws[ref].fill = FILL_AUTO
    ws[ref].border = BORDER
    if fmt:
        ws[ref].number_format = fmt


def sum_active(target, extra=""):
    return "+".join(f'SUMIFS({target},{O["st"]},"{a}"{extra})' for a in ACTIVE)


def cnt_active(extra=""):
    return "+".join(f'COUNTIFS({O["st"]},"{a}"{extra})' for a in ACTIVE)


wsF["A1"] = "FORECAST & KPI – tracker oferte rezidențial (totul se calculează automat, nu scrieți aici)"
wsF["A1"].font = F_T
wsF["A2"] = '="Actualizat la: "&TEXT(TODAY(),"dd.mm.yyyy")'
wsF["A2"].font = Font(italic=True, color="595959")

wsF["A3"] = "(a) Indicatori principali"
wsF["A3"].font = F_S
hdr_row(wsF, 4, ["Indicator", "Valoare"])
KPI = [
    ("Nr. oferte active (status 1-4, 7)", "=" + cnt_active(), FMT_INT),
    ("Valoare pipeline activ (RON, status 1-4, 7)", "=" + sum_active(O["val"]), FMT_MONEY),
    ("Valoare ponderată pipeline activ (RON)", "=" + sum_active(O["vpd"]), FMT_MONEY),
    ("Câștigat – valoare (RON)", f'=SUMIFS({O["val"]},{O["st"]},"5-*")', FMT_MONEY),
    ("Pierdut – valoare (RON)", f'=SUMIFS({O["val"]},{O["st"]},"6-*")', FMT_MONEY),
    ("Rata de câștig % (nr. oferte: câștigat / (câștigat + pierdut))",
     f'=IFERROR(COUNTIFS({O["st"]},"5-*")/(COUNTIFS({O["st"]},"5-*")+COUNTIFS({O["st"]},"6-*")),"")', FMT_PCT),
    ("Rata de câștig % (valoare)",
     f'=IFERROR(SUMIFS({O["val"]},{O["st"]},"5-*")/(SUMIFS({O["val"]},{O["st"]},"5-*")+SUMIFS({O["val"]},{O["st"]},"6-*")),"")', FMT_PCT),
    ("Nr. cereri fără răspuns (toate)", f'=COUNTIFS({O["zf"]},">=0")', FMT_INT),
    ("   din care cu ALERTĂ NERĂSPUNS (≥2 zile lucrătoare)", f'=COUNTIFS({O["zf"]},">=2")', FMT_INT),
    ("Nr. follow-up-uri întârziate (data următorului pas < azi, fără 5/6)",
     f'=COUNTIFS({O["dup"]},"<"&TODAY())-COUNTIFS({O["dup"]},"<"&TODAY(),{O["st"]},"5-*")'
     f'-COUNTIFS({O["dup"]},"<"&TODAY(),{O["st"]},"6-*")', FMT_INT),
    ("Nr. mostre fără feedback", f'=COUNTIFS({MOR["data"]},">0",{MOR["feedback"]},"")', FMT_INT),
    ("   din care cu follow-up scadent", f'=COUNTIFS({MOR["al"]},"FOLLOW-UP MOSTRĂ")', FMT_INT),
]
row = 5
KPI_ROWS = {}
for lab, f, fmt in KPI:
    wsF.cell(row=row, column=1, value=lab).border = BORDER
    auto_cell(wsF, f"B{row}", f, fmt)
    KPI_ROWS[lab] = row
    row += 1
wsF[f"B{KPI_ROWS['   din care cu ALERTĂ NERĂSPUNS (≥2 zile lucrătoare)']}"].font = Font(bold=True, color="C00000")

# (b) 12 luni
row += 1
wsF.cell(row=row, column=1, value="(b) Forecast pe 12 luni (după „Data estimată achiziție”; nr./valoare/ponderată = oferte active 1-4, 7)").font = F_S
row += 1
M_HDR = row
hdr_row(wsF, row, ["Luna (AAAA-LL)", "Început lună", "Nr. oferte", "Valoare totală (RON)",
                   "Valoare ponderată (RON)", "Câștigat (RON)"])
row += 1
M_FIRST = row
for i in range(12):
    r = row + i
    auto_cell(wsF, f"B{r}", f"=EOMONTH(TODAY(),{i - 1})+1", FMT_DATE)
    auto_cell(wsF, f"A{r}", f'=YEAR(B{r})&"-"&IF(MONTH(B{r})<10,"0","")&MONTH(B{r})')
    win = f',{O["da"]},">="&B{r},{O["da"]},"<="&EOMONTH(B{r},0)'
    auto_cell(wsF, f"C{r}", "=" + cnt_active(win), FMT_INT)
    auto_cell(wsF, f"D{r}", "=" + sum_active(O["val"], win), FMT_MONEY)
    auto_cell(wsF, f"E{r}", "=" + sum_active(O["vpd"], win), FMT_MONEY)
    auto_cell(wsF, f"F{r}", f'=SUMIFS({O["val"]},{O["st"]},"5-*"{win})', FMT_MONEY)
M_LAST = row + 11
row = M_LAST + 1
wsF.cell(row=row, column=1, value="TOTAL 12 luni").font = Font(bold=True)
for col, fmt in zip("CDEF", [FMT_INT, FMT_MONEY, FMT_MONEY, FMT_MONEY]):
    auto_cell(wsF, f"{col}{row}", f"=SUM({col}{M_FIRST}:{col}{M_LAST})", fmt)
    wsF[f"{col}{row}"].font = Font(bold=True)
row += 1
old = f',{O["da"]},"<"&B{M_FIRST}'
wsF.cell(row=row, column=1, value="Active cu data estimată DEPĂȘITĂ (de actualizat)").font = Font(color="C00000")
auto_cell(wsF, f"C{row}", "=" + cnt_active(old), FMT_INT)
auto_cell(wsF, f"D{row}", "=" + sum_active(O["val"], old), FMT_MONEY)
auto_cell(wsF, f"E{row}", "=" + sum_active(O["vpd"], old), FMT_MONEY)
row += 1
nod = f',{O["dc"]},">0",{O["da"]},""'
wsF.cell(row=row, column=1, value="Active FĂRĂ dată estimată achiziție").font = Font(color="C00000")
auto_cell(wsF, f"C{row}", "=" + cnt_active(nod), FMT_INT)
auto_cell(wsF, f"D{row}", "=" + sum_active(O["val"], nod), FMT_MONEY)
auto_cell(wsF, f"E{row}", "=" + sum_active(O["vpd"], nod), FMT_MONEY)

# (c) Brand si Responsabil
def breakdown(row, title, list_key, ocol, nrows=8):
    wsF.cell(row=row, column=1, value=title).font = F_S
    row += 1
    hdr_row(wsF, row, ["Valoare", "Nr. oferte active", "", "Valoare activă (RON)",
                       "Valoare ponderată (RON)", "Câștigat (RON)"])
    row += 1
    for i in range(nrows):
        r = row + i
        src = f"{Q(S_LI)}!${LCOL[list_key]}${2 + i}"
        auto_cell(wsF, f"A{r}", f'=IF({src}="","",{src})')
        ex = f',{O[ocol]},A{r}'
        auto_cell(wsF, f"B{r}", f'=IF(A{r}="","",{cnt_active(ex)})', FMT_INT)
        auto_cell(wsF, f"D{r}", f'=IF(A{r}="","",{sum_active(O["val"], ex)})', FMT_MONEY)
        auto_cell(wsF, f"E{r}", f'=IF(A{r}="","",{sum_active(O["vpd"], ex)})', FMT_MONEY)
        auto_cell(wsF, f"F{r}", f'=IF(A{r}="","",SUMIFS({O["val"]},{O["st"]},"5-*"{ex}))', FMT_MONEY)
    return row + nrows + 1


row += 2
row = breakdown(row, "(c1) Defalcare pe Brand", "brand", "brand")
row = breakdown(row, "(c2) Defalcare pe Responsabil", "resp", "resp")

# (d) Status
wsF.cell(row=row, column=1, value="(d) Defalcare pe Status (toate ofertele)").font = F_S
row += 1
hdr_row(wsF, row, ["Status", "Nr. oferte", "", "Valoare (RON)", "Valoare ponderată (RON)"])
row += 1
for i in range(9):
    r = row + i
    src = f"{Q(S_LI)}!${LCOL['status']}${2 + i}"
    auto_cell(wsF, f"A{r}", f'=IF({src}="","",{src})')
    auto_cell(wsF, f"B{r}", f'=IF(A{r}="","",COUNTIFS({O["st"]},A{r}))', FMT_INT)
    auto_cell(wsF, f"D{r}", f'=IF(A{r}="","",SUMIFS({O["val"]},{O["st"]},A{r}))', FMT_MONEY)
    auto_cell(wsF, f"E{r}", f'=IF(A{r}="","",SUMIFS({O["vpd"]},{O["st"]},A{r}))', FMT_MONEY)
r = row + 9
wsF.cell(row=r, column=1, value="Cu dată cerere dar FĂRĂ status (de completat)").font = Font(color="C00000")
auto_cell(wsF, f"B{r}", f'=COUNTIFS({O["dc"]},">0",{O["st"]},"")', FMT_INT)

# Grafic: valoare ponderata pe luni
ch = BarChart()
ch.type = "col"
ch.title = "Valoare ponderată pe luni (RON)"
ch.y_axis.title = "RON"
ch.x_axis.title = "Luna"
ch.legend = None
ch.add_data(Reference(wsF, min_col=5, min_row=M_HDR, max_row=M_LAST), titles_from_data=True)
ch.set_categories(Reference(wsF, min_col=1, min_row=M_FIRST, max_row=M_LAST))
ch.height, ch.width = 9, 18
wsF.add_chart(ch, "H4")
wsF.freeze_panes = "A3"

# =====================================================================
# 1. INSTRUCTIUNI
# =====================================================================
wsI = wb.create_sheet(S_INS, 0)
wsI.sheet_properties.tabColor = "1F4E3D"
wsI.column_dimensions["A"].width = 120
TXT = [
    ("T", "TRACKER OFERTE – PARTENERI REZIDENȚIALI (Effect Creative / WoodClass / Carpathian Floor)"),
    ("", "Versiune 09.11.2026. Pentru: constructori, dezvoltatori, arhitecți/designeri, montatori, clienți finali cu proiecte."),
    ("", ""),
    ("H", "REGULA DE AUR"),
    ("R", "Fiecare cerere de ofertă intră în tracker ÎN ZIUA ÎN CARE VINE (foaia „Oferte & Proiecte”, status „1-Cerere nouă (fără răspuns)”), chiar dacă nu s-a răspuns încă. Altfel nu putem vedea cui nu i-am răspuns."),
    ("", ""),
    ("H", "CULORI ȘI COLOANE"),
    ("", "• Antet VERDE = coloană de completat manual. Antet GRI + „(auto)” + celule cu fundal gri = se calculează singură. NU scrieți și nu lipiți nimic în coloanele gri (strică formula)."),
    ("", "• ID-urile (CL-0001, OF-2026-001, M-001) sunt deja scrise pe fiecare rând. Folosiți primul rând liber de sus în jos; nu modificați ID-urile."),
    ("", "• Datele se scriu ca dată (ex. 09.11.2026). Dacă foaia refuză data, verificați în Google Sheets: Fișier > Setări > Setări regionale = România."),
    ("", "• Procentele (probabilitate manuală, discount) se pot scrie 50% sau 0,5; la probabilitatea manuală și „50” e înțeles ca 50%."),
    ("", "• Filtrele din antet se pot folosi liber (ex. filtrați ALERTĂ sau Responsabil). Prima coloană și antetul rămân fixe la derulare."),
    ("", ""),
    ("H", "CE SE COMPLETEAZĂ ZILNIC (Roxana)"),
    ("", "1. „Jurnal activitate”: un rând pentru FIECARE discuție (telefon, email, WhatsApp, vizită, showroom, videocall) – Data, Responsabil, ID client, ID ofertă (dacă e legată de o ofertă), Canal, Direcție (Intrat/Ieșit), Rezumat, Rezultat, Următorul pas + data."),
    ("", "   Jurnalul alimentează automat coloana „Ultimul contact” din Oferte și alerta „FĂRĂ CONTACT 14+ ZILE”. Completați ID ofertă ori de câte ori discuția e despre o ofertă."),
    ("", "2. „Oferte & Proiecte”: cererile noi ale zilei; actualizați Status, Data trimiterii, Următorul pas și Data următorului pas după fiecare discuție."),
    ("", "3. Dimineața: filtrați coloana ALERTĂ (non-goale) și rezolvați întâi rândurile ROȘII (nerăspuns), apoi PORTOCALII."),
    ("", ""),
    ("H", "CUM ADAUG UN CLIENT NOU"),
    ("", "Foaia „Clienți” > primul rând cu „Firmă / Nume” gol > completați Firmă, Tip partener, Persoană contact, Funcție, Telefon, Email, Oraș, Județ, Sursă lead, Responsabil, Data adăugării. ID-ul de pe rând devine ID-ul clientului. Verificați întâi cu filtrul că firma nu există deja (fără dubluri)."),
    ("", ""),
    ("H", "CUM ADAUG O OFERTĂ / CERERE NOUĂ"),
    ("", "Foaia „Oferte & Proiecte” > primul rând cu „Data cererii” goală > Data cererii (azi), ID client (dropdown; dacă nu există, creați-l întâi în „Clienți”), Nume proiect, Adresă șantier, Oraș/Județ, Tip proiect, Etapă șantier, Brand, Familii produse, Status = 1, Responsabil."),
    ("", "Când oferta pleacă: Produse ofertate (coduri + cantități), Cantitate, UM, Valoare fără TVA, Preț special (Da/Nu), Discount mediu, Data trimiterii, Valabilă până la, Status = 3, Data estimată achiziție, Următorul pas + data."),
    ("", "Prețurile se iau DOAR din listele de preț oficiale sau de la Oana. Orice preț special se trece și în foaia „Prețuri speciale”, cu „Aprobat de”."),
    ("", "Un proiect cu mai multe oferte (ex. pardoseală + plinte separat) = mai multe rânduri, câte unul pe ofertă, cu același Nume proiect."),
    ("", ""),
    ("H", "CUM ADAUG O MOSTRĂ"),
    ("", "Foaia „Mostre” > primul rând cu „Data trimiterii” goală > Data, ID ofertă (dropdown), Produs/cod, Decor, Cantitate, Mod livrare, AWB, Primită?, Data follow-up (recomandat: la 3-5 zile lucrătoare după livrare). Când clientul răspunde, scrieți Feedback – alerta dispare. Coloana „Mostre trimise?” din Oferte devine automat „Da”."),
    ("", ""),
    ("H", "STATUSURI (probabilitatea implicită folosită la forecast)"),
    ("", "1-Cerere nouă (fără răspuns) – 10%: cererea a venit, nu am trimis încă nimic."),
    ("", "2-În lucru – 20%: calculăm oferta / așteptăm informații (cantități, planuri)."),
    ("", "3-Ofertă trimisă – 40%: oferta a plecat la client."),
    ("", "4-Negociere – 60%: clientul discută preț, termen, condiții."),
    ("", "5-Câștigat – 100%: comandă confirmată. 6-Pierdut – 0%: completați obligatoriu Motiv pierdere (+ Concurent dacă se știe). 7-Amânat – 10%: proiectul e pus pe pauză de client."),
    ("", "„Probabilitate manuală %” (opțional) suprascrie procentul implicit când știți mai bine; „Probabilitate folosită %” arată ce intră în calcul. Valoare ponderată = Valoare × Probabilitate folosită."),
    ("", ""),
    ("H", "ALERTE (coloana ALERTĂ arată doar alerta cea mai urgentă)"),
    ("R", "NERĂSPUNS – X zile (rând ROȘU): cererea are 2 sau mai multe zile lucrătoare fără ofertă trimisă (status 1, sau Data trimiterii goală și status diferit de 5/6). Zilele se numără de la ziua de după cerere, fără weekend (sărbătorile legale nu sunt excluse)."),
    ("", "FOLLOW-UP ÎNTÂRZIAT (PORTOCALIU): Data următorului pas a trecut și oferta nu e Câștigată/Pierdută."),
    ("", "OFERTĂ EXPIRATĂ / OFERTĂ EXPIRĂ ÎN <7 ZILE (PORTOCALIU): pentru status 3 sau 4, valabilitatea a trecut sau expiră în mai puțin de 7 zile – reconfirmați prețul sau prelungiți oferta."),
    ("", "FĂRĂ CONTACT 14+ ZILE (GALBEN): status 3 sau 4 și ultimul contact (din Jurnal sau data trimiterii ofertei) e mai vechi de 14 zile."),
    ("", "Rând VERDE = Câștigat; rând GRI = Pierdut. Celula Status ROȘIE = rând cu dată de cerere dar fără status."),
    ("", "Mostre: „FOLLOW-UP MOSTRĂ” când data follow-up a venit și nu există feedback. Prețuri speciale: rând gri = preț expirat; „Aprobat de” portocaliu = preț special fără aprobare."),
    ("", ""),
    ("H", "FORECAST"),
    ("", "Foaia „Forecast” se calculează singură: indicatori, 12 luni începând cu luna curentă (după Data estimată achiziție), defalcare pe Brand, Responsabil și Status, grafic. Ofertele active fără dată estimată sau cu dată depășită apar separat – actualizați-le."),
    ("", ""),
    ("H", "LISTE (dropdown-uri)"),
    ("", "Foaia „Liste” conține toate valorile din dropdown-uri. Oana poate adăuga persoane, familii, surse etc. în prima celulă goală sub fiecare listă (până la rândul 100); apar automat în dropdown. Nu redenumiți statusurile (formulele folosesc cifra de la început)."),
    ("", ""),
    ("H", "RÂNDURILE DE EXEMPLU – DE ȘTERS"),
    ("R", "Rândurile marcate „EXEMPLU” (3 în fiecare foaie) sunt fictive, iar valorile lor sunt doar ilustrative (NU sunt prețuri reale). După ce v-ați familiarizat: ștergeți conținutul celulelor VERZI (manuale) din aceste rânduri – ID-urile și coloanele gri rămân și se refolosesc."),
    ("", ""),
    ("H", "GDPR ȘI ACCES"),
    ("", "• Datele de contact (nume, telefon, email) se folosesc DOAR pentru relația comercială cu partenerul respectiv (ofertare, livrare, follow-up). Nu se folosesc pentru alte scopuri și nu se transmit terților."),
    ("", "• Linkul fișierului rămâne INTERN (doar Roxana și Oana). Nu partajați cu „Oricine are linkul”. Nu descărcați copii pe dispozitive personale."),
    ("", "• Nu treceți date sensibile (CNP, date bancare personale, date de sănătate). Pentru persoane fizice: doar nume, telefon, email, adresa șantierului."),
    ("", "• Dacă o persoană cere ștergerea datelor, se șterg rândurile ei din Clienți și Jurnal și se anunță Oana."),
    ("", ""),
    ("H", "LIMITE CUNOSCUTE"),
    ("", "• Formulele sunt pregătite pe 500 de rânduri (Clienți, Oferte, Mostre, Prețuri speciale) și 3.000 în Jurnal. Peste aceste limite: cereți regenerarea fișierului (scriptul genereaza_tracker.py) sau copiați ultimul rând în jos și extindeți intervalele."),
    ("", "• Nu sortați o singură coloană; folosiți filtrele din antet (sortarea întregului interval e sigură)."),
]
for i, (kind, text) in enumerate(TXT, start=1):
    c = wsI.cell(row=i, column=1, value=text)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    if kind == "T":
        c.font = Font(bold=True, size=16, color="FFFFFF")
        c.fill = FILL_HDR
        wsI.row_dimensions[i].height = 30
    elif kind == "H":
        c.font = Font(bold=True, size=12, color=C_HDR)
        c.fill = PatternFill("solid", fgColor="E2EFDA")
    elif kind == "R":
        c.font = Font(bold=True, color="C00000")

# ordinea foilor
wb._sheets = [wb[s] for s in [S_INS, S_CL, S_OF, S_MO, S_PR, S_JU, S_FC, S_LI]]
wb.active = 0

# =====================================================================
# DATE DE EXEMPLU (fictive, valori ilustrative)
# =====================================================================
D = dt.date
EX_NOTE = "EXEMPLU – rând fictiv, valori ilustrative (nu sunt prețuri reale). De șters."

clienti = [
    ["EXEMPLU – Constructor SRL", "Constructor", "", "EXEMPLU Ion Popescu", "Șef șantier",
     "07xx xxx xxx", "exemplu@exemplu.ro", "Voluntari", "Ilfov", "Recomandare", "Roxana", D(2026, 11, 2)],
    ["EXEMPLU – Arhitect Design SRL", "Arhitect / Designer", "", "EXEMPLU Maria Ionescu", "Arhitect",
     "07xx xxx xxx", "exemplu@exemplu.ro", "București", "București", "Showroom", "Roxana", D(2026, 10, 20)],
    ["EXEMPLU – Dezvoltator Rezidențial SRL", "Dezvoltator imobiliar", "", "EXEMPLU Andrei Georgescu",
     "Manager achiziții", "07xx xxx xxx", "exemplu@exemplu.ro", "Brașov", "Brașov", "Agent", "Oana",
     D(2026, 9, 15)],
]
keys = ["firma", "tip", "cui", "contact", "functie", "tel", "email", "oras", "judet", "sursa", "resp", "data"]
for i, vals in enumerate(clienti):
    r = 2 + i
    for k, v in zip(keys, vals):
        wsC[f"{CC[k]}{r}"] = v
    wsC[f"{CC['obs']}{r}"] = EX_NOTE

oferte = [
    dict(dc=D(2026, 11, 2), idc="CL-0001", proiect="EXEMPLU – Casă P+1", adresa="Str. Exemplu nr. 1",
         oras="Voluntari / Ilfov", tipp="Casă individuală", etapa="Finisaje", brand="WoodClass",
         familii="Plinte polimer", produse="EXEMPLU: plintă polimer – cod de stabilit", cant=120, um="ml",
         val=10000, st="1-Cerere nouă (fără răspuns)", da=D(2026, 12, 15), up="Trimite oferta",
         dup=D(2026, 11, 3), resp="Roxana"),
    dict(dc=D(2026, 10, 20), idc="CL-0002", proiect="EXEMPLU – Apartament client arhitect",
         adresa="Bd. Exemplu nr. 2, ap. 3", oras="București", tipp="Apartament", etapa="Finisaje",
         brand="Carpathian Floor", familii="Pardoseală SPC TANIN", produse="EXEMPLU: SPC TANIN decor X – 250 mp",
         cant=250, um="mp", val=25000, ps="Da", disc=0.10, dt=D(2026, 10, 22), vp=D(2026, 11, 13),
         st="3-Ofertă trimisă", pm=0.5, da=D(2027, 1, 15), up="Revin cu discountul aprobat",
         dup=D(2026, 11, 12), resp="Roxana"),
    dict(dc=D(2026, 9, 15), idc="CL-0003", proiect="EXEMPLU – Ansamblu 12 case", adresa="Str. Exemplu nr. 3",
         oras="Brașov / Brașov", tipp="Bloc/ansamblu rezidențial", etapa="Instalații", brand="Mixt",
         familii="Altele/mix", produse="EXEMPLU: SPC + plinte + praguri – coduri de stabilit", cant=1,
         um="set", val=40000, ps="Da", disc=0.08, dt=D(2026, 9, 18), vp=D(2026, 10, 18),
         st="5-Câștigat", da=D(2026, 11, 20), up="Programare livrare", dup=D(2026, 11, 16), resp="Oana"),
]
for i, o in enumerate(oferte):
    r = 2 + i
    for k, v in o.items():
        wsO[f"{OC[k]}{r}"] = v
    wsO[f"{OC['obs']}{r}"] = EX_NOTE

mostre = [
    dict(data=D(2026, 10, 23), idof="OF-2026-002", produs="EXEMPLU – mostră SPC TANIN", decor="EXEMPLU decor",
         cant=2, livrare="Curier", awb="EXEMPLU-AWB-001", primita="Da", dfu=D(2026, 11, 6), resp="Roxana"),
    dict(data=D(2026, 9, 16), idof="OF-2026-003", produs="EXEMPLU – mostră plintă", decor="EXEMPLU alb",
         cant=1, livrare="Personal", primita="Da", feedback="EXEMPLU – clientul a ales decorul", dfu=D(2026, 9, 23),
         resp="Oana"),
    dict(data=D(2026, 9, 16), idof="OF-2026-003", produs="EXEMPLU – mostră prag", decor="EXEMPLU argintiu",
         cant=1, livrare="Showroom", primita="Da", feedback="EXEMPLU – OK", dfu=D(2026, 9, 23), resp="Oana"),
]
for i, m in enumerate(mostre):
    r = 2 + i
    for k, v in m.items():
        wsM[f"{MC[k]}{r}"] = v
    wsM[f"{MC['obs']}{r}"] = EX_NOTE

preturi = [
    dict(idof="OF-2026-002", cod="EX-COD-001", den="EXEMPLU – produs pardoseală", um="mp", pl=100, ps=90,
         cmin=200, vp=D(2026, 11, 13), apr="Oana", cond="EXEMPLU – plată 50% avans, livrare inclusă"),
    dict(idof="OF-2026-003", cod="EX-COD-002", den="EXEMPLU – produs plintă", um="ml", pl=20, ps=17,
         cmin=500, vp=D(2026, 10, 31), apr="Oana", cond="EXEMPLU – OP la 30 zile"),
    dict(idof="OF-2026-003", cod="EX-COD-003", den="EXEMPLU – produs prag", um="buc", pl=50, ps=45,
         cmin=50, vp=D(2026, 12, 31), cond="EXEMPLU – în așteptarea aprobării"),
]
for i, p in enumerate(preturi):
    r = 2 + i
    for k, v in p.items():
        wsP[f"{PC[k]}{r}"] = v
    wsP[f"{PC['obs']}{r}"] = EX_NOTE

jurnal = [
    dict(data=D(2026, 10, 22), resp="Roxana", idc="CL-0002", idof="OF-2026-002", canal="Email", dir="Ieșit",
         subiect="EXEMPLU – trimis oferta SPC", produse="SPC TANIN", rez="Interesat",
         up="Telefon de confirmare primire", dup=D(2026, 10, 24)),
    dict(data=D(2026, 11, 3), resp="Oana", idc="CL-0003", idof="OF-2026-003", canal="Întâlnire showroom",
         dir="Intrat", subiect="EXEMPLU – confirmare comandă ansamblu", produse="SPC + plinte + praguri",
         rez="Comandă confirmată", up="Programare livrare", dup=D(2026, 11, 16)),
    dict(data=D(2026, 11, 5), resp="Roxana", idc="CL-0002", idof="OF-2026-002", canal="Telefon", dir="Ieșit",
         subiect="EXEMPLU – follow-up ofertă, cere discount suplimentar", produse="SPC TANIN", rez="Negociere",
         up="Revin cu discountul aprobat", dup=D(2026, 11, 12)),
]
for i, j in enumerate(jurnal):
    r = 2 + i
    for k, v in j.items():
        wsJ[f"{JC[k]}{r}"] = v

# evidentiere galbena pe ID-ul randurilor de exemplu
EXF = PatternFill("solid", fgColor="FFFF99")
for ws in (wsC, wsO, wsM, wsP, wsJ):
    for r in (2, 3, 4):
        ws.cell(row=r, column=1).fill = EXF

wb.save(OUT)
print("Salvat:", OUT)
