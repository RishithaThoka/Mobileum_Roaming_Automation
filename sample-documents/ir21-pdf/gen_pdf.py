from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

styles = getSampleStyleSheet()
section_style = ParagraphStyle('Section', parent=styles['Heading2'], spaceBefore=16, spaceAfter=8, textColor=colors.HexColor('#14213D'))
field_style = ParagraphStyle('Field', parent=styles['Normal'], spaceAfter=5, fontSize=10.5)

def build(path, fields):
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=54, bottomMargin=54)
    story = [Paragraph('Airtel India — IR.21 Master Document', styles['Title']), Spacer(1, 14)]
    for section_title, rows in fields.items():
        story.append(Paragraph(section_title.upper(), section_style))
        for label, value in rows:
            story.append(Paragraph(f'<b>{label}:</b> {value}', field_style))
    doc.build(story)

v1 = {
    "Network Technical": [
        ("HLR Global Title", "919820000000"),
        ("Signalling Point Code", "5-21-9"),
        ("GRX IPX Provider", "Tata Communications"),
        ("APN Roaming", "airtel.in.roaming"),
    ],
    "Security": [
        ("Steering Of Roaming Supported", "true"),
        ("Fraud Contact Email", "fraud@airtel-test.example"),
    ],
    "Commercial": [
        ("Roaming Agreement Type", "Bilateral"),
        ("Preferred Roaming Partner Tier", "Tier2"),
    ],
    "Financial Billing": [
        ("Wholesale Voice Rate", "0.0140"),
        ("Wholesale Data Rate Per MB", "0.0035"),
        ("Currency", "USD"),
        ("Settlement Contact", "settlements@airtel-test.example"),
    ],
    "Operations": [
        ("Roaming Operations Manager", "Rohan Mehta"),
        ("Support Hours", "24x7"),
        ("Effective Date", "2026-05-01"),
    ],
}

v2 = {
    "Network Technical": [
        ("HLR Global Title", "919820009999"),
        ("Signalling Point Code", "5-21-9"),
        ("GRX IPX Provider", "BICS"),
        ("APN Roaming", "airtel.in.roaming"),
    ],
    "Security": [
        ("Steering Of Roaming Supported", "true"),
        ("Fraud Contact Email", "fraud-desk@airtel-test.example"),
    ],
    "Commercial": [
        ("Roaming Agreement Type", "Bilateral"),
        ("Preferred Roaming Partner Tier", "Tier1"),
    ],
    "Financial Billing": [
        ("Wholesale Voice Rate", "0.0158"),
        ("Wholesale Data Rate Per MB", "0.0029"),
        ("Currency", "USD"),
        ("Settlement Contact", "settlements@airtel-test.example"),
    ],
    "Operations": [
        ("Roaming Operations Manager", "Rohan Mehta"),
        ("Support Hours", "24x7"),
        ("Effective Date", "2026-11-01"),
    ],
}

build("AirtelIndia_IR21_v1.pdf", v1)
build("AirtelIndia_IR21_v2.pdf", v2)
print("done")
