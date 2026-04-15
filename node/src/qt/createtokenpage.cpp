// Copyright (c) 2026 GarudaChain developers
// Create Token (Saham) page — Creator wallet mode
// Struktur mengikuti website PenerbitanSaham.tsx
#include <qt/createtokenpage.h>
#include <qt/clientmodel.h>
#include <qt/walletmodel.h>
#include <qt/platformstyle.h>
#include <interfaces/node.h>
#include <univalue.h>

#include <QComboBox>
#include <QDoubleSpinBox>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
#include <QFormLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QHttpMultiPart>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPushButton>
#include <QPixmap>
#include <QScrollArea>
#include <QSlider>
#include <QSpinBox>
#include <QStackedWidget>
#include <QTabWidget>
#include <QTextBrowser>
#include <QTextEdit>
#include <QVBoxLayout>
#include <QJsonDocument>
#include <QJsonObject>

// Biaya sesuai website (PenerbitanSaham.tsx)
static const double CREATION_FEE_GRD = 5000.0;   // 5.000 GRD flat
static const double PRESALE_FEE_PCT  = 2.0;        // 2% dari hasil presale

// Helper: buat separator label section
static QLabel* sectionTitle(const QString &text)
{
    QLabel *l = new QLabel(QString("<b style='color:#8B0000;'>%1</b>").arg(text));
    l->setStyleSheet("border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 4px;");
    return l;
}

CreateTokenPage::CreateTokenPage(const PlatformStyle *_platformStyle, QWidget *parent)
    : QWidget(parent), platformStyle(_platformStyle)
{
    m_nam = new QNetworkAccessManager(this);
    buildUI();
}

void CreateTokenPage::setClientModel(ClientModel *m) { clientModel = m; }
void CreateTokenPage::setWalletModel(WalletModel *m)
{
    walletModel = m;
    loadAddresses();
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::buildUI()
{
    QVBoxLayout *root = new QVBoxLayout(this);
    root->setContentsMargins(6, 6, 6, 6);
    root->setSpacing(4);

    tabs = new QTabWidget(this);
    tabs->setUsesScrollButtons(false);
    tabs->setStyleSheet(
        "QTabBar::tab { padding: 8px 20px; font-weight: bold; font-size: 12px; min-width: 120px; }"
        "QTabBar::tab:selected { color: #8B0000; border-bottom: 2px solid #8B0000; }");

    // ── Tab 0: Buat Token Saham ─────────────────────────────────────────
    QWidget *createTab = new QWidget();
    QVBoxLayout *ctL = new QVBoxLayout(createTab);
    ctL->setSpacing(6);

    // Step bar
    stepBar = new QLabel();
    stepBar->setAlignment(Qt::AlignCenter);
    stepBar->setStyleSheet("font-size: 12px; padding: 4px; background: #f9f9f9; border-radius: 4px;");
    ctL->addWidget(stepBar);

    // Stack (4 pages)
    stack = new QStackedWidget();
    ctL->addWidget(stack, 1);

    // ─── Step 1: Info Token & Perusahaan ───────────────────────────────
    QScrollArea *sa1 = new QScrollArea();
    sa1->setWidgetResizable(true);
    QWidget *p1 = new QWidget();
    QVBoxLayout *v1 = new QVBoxLayout(p1);
    v1->setSpacing(8);

    v1->addWidget(sectionTitle("Identitas Token Saham"));
    QFormLayout *f1a = new QFormLayout();
    fSymbol = new QLineEdit(); fSymbol->setPlaceholderText("WBSA"); fSymbol->setMaxLength(6);
    fSymbol->setStyleSheet("font-weight:bold; font-size:14px; text-transform:uppercase;");
    f1a->addRow(tr("Simbol Saham *"), fSymbol);
    fTokenName = new QLineEdit(); fTokenName->setPlaceholderText("Saham BSA Logistics");
    f1a->addRow(tr("Nama Token *"), fTokenName);
    fCompany = new QLineEdit(); fCompany->setPlaceholderText("PT BSA Logistics Indonesia Tbk");
    f1a->addRow(tr("Nama Perusahaan *"), fCompany);
    fType = new QComboBox();
    fType->addItems({"Konvensional", "Syariah"});
    f1a->addRow(tr("Jenis"), fType);
    v1->addLayout(f1a);

    v1->addWidget(sectionTitle("Sektor &amp; Usaha"));
    QFormLayout *f1b = new QFormLayout();
    fSector = new QComboBox();
    fSector->addItems({
        "Perbankan", "Keuangan", "Teknologi Informasi", "Energi", "Kesehatan",
        "Properti & Real Estate", "Konsumer", "Industri Manufaktur",
        "Telekomunikasi", "Pertambangan", "Pertanian & Agribisnis",
        "Infrastruktur", "Transportasi & Logistik", "Ritel", "Media & Hiburan",
        "Pariwisata & Hotel"
    });
    f1b->addRow(tr("Sektor"), fSector);
    fSubsector = new QLineEdit(); fSubsector->setPlaceholderText("Logistik & Pengantaran");
    f1b->addRow(tr("Subsektor"), fSubsector);
    fBusiness = new QLineEdit(); fBusiness->setPlaceholderText("Angkutan Multimoda, Pergudangan dan Penyimpanan");
    f1b->addRow(tr("Bidang Usaha"), fBusiness);
    fCorpAddress = new QLineEdit(); fCorpAddress->setPlaceholderText("Jl. Raya Cakung Cilincing KM 3, Jakarta Timur 13910");
    f1b->addRow(tr("Alamat Perusahaan"), fCorpAddress);
    v1->addLayout(f1b);

    v1->addWidget(sectionTitle("Website &amp; Media Sosial"));
    QFormLayout *f1c = new QFormLayout();
    fWebsite = new QLineEdit(); fWebsite->setPlaceholderText("https://www.bsa-logistics.co.id");
    f1c->addRow(tr("🌐 Website"), fWebsite);
    fSocialX = new QLineEdit(); fSocialX->setPlaceholderText("https://x.com/perusahaan");
    f1c->addRow(tr("✖ Twitter/X"), fSocialX);
    fSocialIG = new QLineEdit(); fSocialIG->setPlaceholderText("https://instagram.com/perusahaan");
    f1c->addRow(tr("📸 Instagram"), fSocialIG);
    fSocialYT = new QLineEdit(); fSocialYT->setPlaceholderText("https://youtube.com/@perusahaan");
    f1c->addRow(tr("▶ YouTube"), fSocialYT);
    fSocialFB = new QLineEdit(); fSocialFB->setPlaceholderText("https://facebook.com/perusahaan");
    f1c->addRow(tr("👍 Facebook"), fSocialFB);
    fSocialLI = new QLineEdit(); fSocialLI->setPlaceholderText("https://linkedin.com/company/perusahaan");
    f1c->addRow(tr("💼 LinkedIn"), fSocialLI);
    fSocialTT = new QLineEdit(); fSocialTT->setPlaceholderText("https://tiktok.com/@perusahaan");
    f1c->addRow(tr("🎵 TikTok"), fSocialTT);
    v1->addLayout(f1c);

    v1->addWidget(sectionTitle("Deskripsi Perusahaan"));
    fDesc = new QTextEdit();
    fDesc->setPlaceholderText(
        "Ceritakan tentang perusahaan Anda: sejarah pendirian, kegiatan usaha, visi misi, "
        "pencapaian, dll. Deskripsi ini akan muncul di halaman IPO website GarudaChain.");
    fDesc->setMinimumHeight(80);
    v1->addWidget(fDesc);

    // ── Upload Logo Perusahaan ────────────────────────────────────────
    v1->addWidget(sectionTitle("Logo Perusahaan"));
    QHBoxLayout *logoRow = new QHBoxLayout();
    fLogoPreview = new QLabel();
    fLogoPreview->setFixedSize(80, 80);
    fLogoPreview->setStyleSheet(
        "border: 2px dashed #ccc; border-radius: 8px; background: #f9f9f9;");
    fLogoPreview->setAlignment(Qt::AlignCenter);
    fLogoPreview->setText(tr("Logo"));
    QVBoxLayout *logoRight = new QVBoxLayout();
    fLogoUploadBtn = new QPushButton(tr("📷  Pilih Gambar Logo..."));
    fLogoUploadBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; "
        "padding:6px 12px; border-radius:4px; }"
        "QPushButton:hover { background:#1976D2; }");
    fLogoCid = new QLineEdit();
    fLogoCid->setPlaceholderText(tr("IPFS CID akan muncul otomatis setelah upload..."));
    fLogoCid->setReadOnly(true);
    fLogoCid->setStyleSheet("color:#2E7D32; font-family:monospace; font-size:11px;");
    QLabel *logoNote = new QLabel(
        tr("<small style='color:#666;'>Format: PNG, JPG, SVG. Maks 5MB. "
           "Gambar diunggah ke IPFS dan langsung tampil di website GarudaChain.</small>"));
    logoNote->setWordWrap(true);
    logoRight->addWidget(fLogoUploadBtn);
    logoRight->addWidget(fLogoCid);
    logoRight->addWidget(logoNote);
    logoRow->addWidget(fLogoPreview);
    logoRow->addLayout(logoRight, 1);
    v1->addLayout(logoRow);

    // ── Upload Dokumen Resmi ──────────────────────────────────────────
    v1->addWidget(sectionTitle("Dokumen Resmi (Upload ke IPFS)"));
    QFormLayout *f1d = new QFormLayout();

    // Prospektus
    QHBoxLayout *prospRow = new QHBoxLayout();
    fProspektusCid = new QLineEdit();
    fProspektusCid->setPlaceholderText(tr("IPFS CID prospektus..."));
    fProspektusCid->setReadOnly(true);
    fProspektusCid->setStyleSheet("color:#2E7D32; font-family:monospace; font-size:11px;");
    fProspektusUploadBtn = new QPushButton(tr("📄 Upload Prospektus (PDF)"));
    fProspektusUploadBtn->setStyleSheet(
        "QPushButton { background:#37474F; color:white; padding:5px 10px; border-radius:4px; }"
        "QPushButton:hover { background:#455A64; }");
    prospRow->addWidget(fProspektusCid, 1);
    prospRow->addWidget(fProspektusUploadBtn);
    QWidget *prospW = new QWidget(); prospW->setLayout(prospRow);
    f1d->addRow(tr("📄 Prospektus:"), prospW);

    // Legalitas
    QHBoxLayout *legalRow = new QHBoxLayout();
    fLegalitasCid = new QLineEdit();
    fLegalitasCid->setPlaceholderText(tr("IPFS CID dokumen legalitas..."));
    fLegalitasCid->setReadOnly(true);
    fLegalitasCid->setStyleSheet("color:#2E7D32; font-family:monospace; font-size:11px;");
    fLegalitasUploadBtn = new QPushButton(tr("📋 Upload Legalitas (PDF/ZIP)"));
    fLegalitasUploadBtn->setStyleSheet(
        "QPushButton { background:#37474F; color:white; padding:5px 10px; border-radius:4px; }"
        "QPushButton:hover { background:#455A64; }");
    legalRow->addWidget(fLegalitasCid, 1);
    legalRow->addWidget(fLegalitasUploadBtn);
    QWidget *legalW = new QWidget(); legalW->setLayout(legalRow);
    f1d->addRow(tr("📋 Legalitas:"), legalW);

    f1d->addRow(new QLabel(
        tr("<small style='color:#666;'>Dokumen dienkripsi dan disimpan permanen di IPFS. "
           "CID tercatat dalam metadata token on-chain.</small>")));
    v1->addLayout(f1d);
    v1->addStretch();

    sa1->setWidget(p1);
    stack->addWidget(sa1);

    // ─── Step 2: Supply & Harga ────────────────────────────────────────
    QWidget *p2 = new QWidget();
    QVBoxLayout *v2 = new QVBoxLayout(p2);
    v2->setSpacing(10);

    v2->addWidget(sectionTitle("Jumlah &amp; Harga Saham"));
    QLabel *noteSupply = new QLabel(
        tr("<small style='color:#666;'>1 token = 1 lembar saham perusahaan Anda.</small>"));
    noteSupply->setWordWrap(true);
    v2->addWidget(noteSupply);

    QFormLayout *f2 = new QFormLayout();
    fSupply = new QLineEdit("1000000");
    fSupply->setPlaceholderText("1000000");
    f2->addRow(tr("Total Supply (lembar) *"), fSupply);

    fPrice = new QLineEdit("100");
    fPrice->setPlaceholderText("100");
    QLabel *priceNote = new QLabel(tr("<small style='color:#666;'>Harga awal saat presale (e-IPO) dalam GRD.</small>"));
    f2->addRow(tr("Harga per Token (GRD) *"), fPrice);
    f2->addRow("", priceNote);
    v2->addLayout(f2);

    fSupplyInfo = new QLabel();
    fSupplyInfo->setWordWrap(true);
    fSupplyInfo->setStyleSheet(
        "background:#f0f8ff; border:1px solid #b3d4f0; border-radius:6px; "
        "padding:10px; font-size:12px; color:#333;");
    v2->addWidget(fSupplyInfo);

    v2->addWidget(sectionTitle("Biaya Pembuatan"));
    QLabel *feeInfo = new QLabel(
        QString("<div style='background:#FFF8E1; border:1px solid #FFE082; border-radius:6px; padding:10px;'>"
                "<b style='color:#F57F17;'>Biaya Platform:</b><br>"
                "• <b>%1 GRD</b> — biaya deploy token saham (flat)<br>"
                "• <b>%2%</b> dari hasil presale — platform fee saat e-IPO selesai<br>"
                "<small style='color:#666;'>Dana terkumpul presale dikurangi platform fee langsung dikirim ke wallet Anda.</small>"
                "</div>")
        .arg(static_cast<int>(CREATION_FEE_GRD))
        .arg(static_cast<int>(PRESALE_FEE_PCT)));
    feeInfo->setWordWrap(true);
    v2->addWidget(feeInfo);
    v2->addStretch();

    stack->addWidget(p2);

    // ─── Step 3: Presale (e-IPO) ───────────────────────────────────────
    QWidget *p3 = new QWidget();
    QVBoxLayout *v3 = new QVBoxLayout(p3);
    v3->setSpacing(10);

    v3->addWidget(sectionTitle("Alokasi Presale (e-IPO)"));
    QLabel *noteIPO = new QLabel(
        tr("<small style='color:#666;'>e-IPO: investor beli token saham sebelum listing di DEX. "
           "Token tidak terjual dikembalikan ke wallet Anda setelah presale berakhir. "
           "Alokasi minimal 10%, maksimal 80% dari total supply.</small>"));
    noteIPO->setWordWrap(true);
    v3->addWidget(noteIPO);

    fAllocSlider = new QSlider(Qt::Horizontal);
    fAllocSlider->setRange(10, 80);
    fAllocSlider->setValue(30);
    fAllocSlider->setTickInterval(10);
    fAllocSlider->setTickPosition(QSlider::TicksBelow);
    v3->addWidget(fAllocSlider);

    fAllocLabel = new QLabel();
    fAllocLabel->setAlignment(Qt::AlignCenter);
    fAllocLabel->setStyleSheet("font-size:14px; font-weight:bold; color:#8B0000;");
    v3->addWidget(fAllocLabel);

    QFormLayout *f3 = new QFormLayout();
    fDuration = new QComboBox();
    fDuration->addItems({"3 Hari", "7 Hari", "14 Hari", "30 Hari"});
    fDuration->setCurrentIndex(1); // default 7 hari
    f3->addRow(tr("Durasi Presale"), fDuration);
    v3->addLayout(f3);

    fPresaleCalc = new QLabel();
    fPresaleCalc->setWordWrap(true);
    fPresaleCalc->setStyleSheet(
        "background:#E8F5E9; border:1px solid #A5D6A7; border-radius:6px; "
        "padding:12px; font-size:12px;");
    v3->addWidget(fPresaleCalc);

    v3->addWidget(sectionTitle("Alamat Penerbit (dari Wallet)"));
    QHBoxLayout *addrRow = new QHBoxLayout();
    fIssuerAddr = new QComboBox(); fIssuerAddr->setEditable(true);
    fLoadAddr = new QPushButton(tr("Muat Alamat"));
    fLoadAddr->setStyleSheet("QPushButton { padding: 5px 10px; }");
    addrRow->addWidget(fIssuerAddr, 1);
    addrRow->addWidget(fLoadAddr);
    v3->addLayout(addrRow);

    QLabel *addrNote = new QLabel(
        tr("<small style='color:#666;'>Pilih alamat wallet Creator Anda sebagai penerbit token. "
           "Biaya deploy (5.000 GRD) diambil dari alamat ini.</small>"));
    addrNote->setWordWrap(true);
    v3->addWidget(addrNote);
    v3->addStretch();

    stack->addWidget(p3);

    // ─── Step 4: Review & Deploy ───────────────────────────────────────
    QWidget *p4 = new QWidget();
    QVBoxLayout *v4 = new QVBoxLayout(p4);

    QLabel *reviewTitle = new QLabel(
        "<b style='color:#8B0000; font-size:13px;'>Periksa semua data sebelum deploy ke blockchain.</b>"
        "<br><small style='color:#666;'>Data tidak dapat diubah setelah di-deploy.</small>");
    reviewTitle->setWordWrap(true);
    v4->addWidget(reviewTitle);

    fReview = new QTextBrowser();
    fReview->setOpenExternalLinks(false);
    v4->addWidget(fReview, 1);

    deployBtn = new QPushButton(tr("🚀  Deploy Token Saham ke GarudaChain"));
    deployBtn->setStyleSheet(
        "QPushButton { background-color:#8B0000; color:white; font-weight:bold; font-size:13px; "
        "padding:12px 24px; border-radius:6px; } "
        "QPushButton:hover { background-color:#6B0000; }");
    v4->addWidget(deployBtn);

    stack->addWidget(p4);

    // Nav buttons
    QHBoxLayout *nav = new QHBoxLayout();
    prevBtn = new QPushButton(tr("◀ Sebelumnya"));
    prevBtn->setStyleSheet("QPushButton { padding:7px 18px; }");
    nextBtn = new QPushButton(tr("Selanjutnya ▶"));
    nextBtn->setStyleSheet(
        "QPushButton { background:#8B0000; color:white; font-weight:bold; "
        "padding:7px 18px; border-radius:4px; }");
    nav->addWidget(prevBtn);
    nav->addStretch();
    nav->addWidget(nextBtn);
    ctL->addLayout(nav);

    tabs->addTab(createTab, tr("Buat Token Saham"));

    // ── Tab 1: Dividen ─────────────────────────────────────────────────
    QWidget *divTab = new QWidget();
    QVBoxLayout *divL = new QVBoxLayout(divTab);

    QLabel *divHdr = new QLabel(
        "<h3 style='color:#8B0000; margin:0;'>Distribusi Dividen</h3>"
        "<p style='color:#666; font-size:12px;'>Bagikan keuntungan ke semua pemegang saham secara proporsional — otomatis on-chain.</p>");
    divHdr->setWordWrap(true);
    divL->addWidget(divHdr);

    QGroupBox *divGrp = new QGroupBox(tr("Bayar Dividen"));
    QFormLayout *divFrm = new QFormLayout(divGrp);
    divToken = new QComboBox();
    divFrm->addRow(tr("Token Saham:"), divToken);
    divAmount = new QLineEdit(); divAmount->setPlaceholderText("1000.00 GRD");
    divFrm->addRow(tr("Total Dividen (GRD):"), divAmount);

    QHBoxLayout *divBtnRow = new QHBoxLayout();
    divPreviewBtn = new QPushButton(tr("Preview"));
    divPreviewBtn->setStyleSheet("QPushButton { background:#1565C0; color:white; padding:7px 14px; border-radius:4px; }");
    divPayBtn = new QPushButton(tr("Bayar Dividen ke Semua Pemegang Saham"));
    divPayBtn->setStyleSheet("QPushButton { background:#2E7D32; color:white; font-weight:bold; padding:7px 14px; border-radius:4px; }");
    divBtnRow->addWidget(divPreviewBtn);
    divBtnRow->addWidget(divPayBtn, 1);
    divFrm->addRow(divBtnRow);
    divL->addWidget(divGrp);

    divResult = new QTextBrowser();
    divResult->setHtml("<p style='color:#888;'>Klik Preview untuk melihat estimasi distribusi dividen.</p>");
    divL->addWidget(divResult);
    tabs->addTab(divTab, tr("Dividen"));

    // ── Tab 2: e-IPO Aktif ─────────────────────────────────────────────
    QWidget *ipoTab = new QWidget();
    QVBoxLayout *ipoL = new QVBoxLayout(ipoTab);

    QLabel *ipoHdr = new QLabel(
        "<h3 style='color:#8B0000; margin:0;'>e-IPO &amp; Presale Aktif</h3>"
        "<p style='color:#666; font-size:12px;'>Token saham Anda yang sedang dalam masa penawaran (presale) di GarudaChain.</p>");
    ipoHdr->setWordWrap(true);
    ipoL->addWidget(ipoHdr);

    ipoRefreshBtn = new QPushButton(tr("Refresh Data e-IPO"));
    ipoRefreshBtn->setStyleSheet("QPushButton { background:#1565C0; color:white; padding:6px 14px; border-radius:4px; }");
    ipoL->addWidget(ipoRefreshBtn);

    ipoBrowser = new QTextBrowser();
    ipoBrowser->setHtml(
        "<div style='text-align:center; padding:40px; color:#888;'>"
        "<p style='font-size:24px;'>📋</p>"
        "<p>Klik Refresh untuk memuat data e-IPO dari blockchain.</p>"
        "</div>");
    ipoL->addWidget(ipoBrowser);
    tabs->addTab(ipoTab, tr("e-IPO Aktif"));

    // ── Tab 3: Token Saya ──────────────────────────────────────────────
    QWidget *tokenTab = new QWidget();
    QVBoxLayout *tokenL = new QVBoxLayout(tokenTab);

    QLabel *tokenHdr = new QLabel(
        "<h3 style='color:#8B0000; margin:0;'>Token Saham Saya</h3>"
        "<p style='color:#666; font-size:12px;'>Semua token saham yang telah Anda terbitkan di GarudaChain.</p>");
    tokenHdr->setWordWrap(true);
    tokenL->addWidget(tokenHdr);

    tokenRefreshBtn = new QPushButton(tr("Refresh Daftar Token"));
    tokenRefreshBtn->setStyleSheet("QPushButton { background:#1565C0; color:white; padding:6px 14px; border-radius:4px; }");
    tokenL->addWidget(tokenRefreshBtn);

    tokenBrowser = new QTextBrowser();
    tokenBrowser->setHtml("<p style='color:#888; text-align:center; padding:20px;'>Klik Refresh untuk memuat daftar token.</p>");
    tokenL->addWidget(tokenBrowser);
    tabs->addTab(tokenTab, tr("Token Saya"));

    root->addWidget(tabs);

    // ── Connections ───────────────────────────────────────────────────
    connect(prevBtn,        &QPushButton::clicked, this, &CreateTokenPage::onPrev);
    connect(nextBtn,        &QPushButton::clicked, this, &CreateTokenPage::onNext);
    connect(deployBtn,      &QPushButton::clicked, this, &CreateTokenPage::onDeploy);
    connect(fLoadAddr,      &QPushButton::clicked, this, &CreateTokenPage::onLoadAddresses);
    connect(divPreviewBtn,  &QPushButton::clicked, this, &CreateTokenPage::onPreviewDividend);
    connect(divPayBtn,      &QPushButton::clicked, this, &CreateTokenPage::onPayDividend);
    connect(ipoRefreshBtn,  &QPushButton::clicked, this, &CreateTokenPage::onRefreshIPO);
    connect(tokenRefreshBtn,&QPushButton::clicked, this, &CreateTokenPage::onRefreshTokens);

    connect(fSupply, &QLineEdit::textChanged, this, &CreateTokenPage::onCalcChanged);
    connect(fPrice,  &QLineEdit::textChanged, this, &CreateTokenPage::onCalcChanged);
    connect(fAllocSlider, &QSlider::valueChanged, this, &CreateTokenPage::onCalcChanged);

    connect(fLogoUploadBtn,      &QPushButton::clicked, this, &CreateTokenPage::onUploadLogo);
    connect(fProspektusUploadBtn,&QPushButton::clicked, this, &CreateTokenPage::onUploadProspektus);
    connect(fLegalitasUploadBtn, &QPushButton::clicked, this, &CreateTokenPage::onUploadLegalitas);

    refreshStepBar();
    onCalcChanged();
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP BAR
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::refreshStepBar()
{
    static const QStringList labels = {
        "1. Info Token", "2. Supply & Harga", "3. Presale (e-IPO)", "4. Review & Deploy"
    };
    QString html;
    for (int i = 0; i < labels.size(); ++i) {
        bool active = (i + 1 == step);
        bool done   = (i + 1 < step);
        if (done)
            html += QString("<span style='color:#2E7D32; font-weight:bold;'>✓ %1</span>").arg(labels[i]);
        else if (active)
            html += QString("<span style='color:#8B0000; font-weight:bold; text-decoration:underline;'>%1</span>").arg(labels[i]);
        else
            html += QString("<span style='color:#aaa;'>%1</span>").arg(labels[i]);
        if (i < labels.size() - 1) html += " &nbsp;›&nbsp; ";
    }
    stepBar->setText(html);
    prevBtn->setEnabled(step > 1);
    nextBtn->setVisible(step < 4);
    deployBtn->setVisible(step == 4);
}

// ══════════════════════════════════════════════════════════════════════════════
// CALC (supply × price × alokasi)
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onCalcChanged()
{
    qint64 supply = fSupply->text().toLongLong();
    double price  = fPrice->text().toDouble();
    int    alloc  = fAllocSlider ? fAllocSlider->value() : 30;

    // Update step 2 info
    if (fSupplyInfo) {
        fSupplyInfo->setText(
            QString("<b>Total Supply:</b> %L1 lembar &nbsp;|&nbsp; "
                    "<b>Market Cap (IPO):</b> %L2 GRD")
            .arg(supply).arg(supply * price, 0, 'f', 0));
    }

    // Update step 3 info
    if (fAllocLabel) {
        qint64 presaleTokens = static_cast<qint64>(supply * alloc / 100.0);
        double presaleRaise  = presaleTokens * price;
        double platformFee   = presaleRaise * PRESALE_FEE_PCT / 100.0;
        double netRaise      = presaleRaise - platformFee;

        fAllocLabel->setText(
            QString("Alokasi Presale: <b>%1%</b> → <b>%L2 token</b>").arg(alloc).arg(presaleTokens));

        if (fPresaleCalc) {
            fPresaleCalc->setText(
                QString("<table width='100%'>"
                        "<tr><td style='color:#444;'>Token untuk Presale:</td>"
                        "<td style='text-align:right;'><b>%L1 lembar (%2%)</b></td></tr>"
                        "<tr><td style='color:#444;'>Token disimpan Creator:</td>"
                        "<td style='text-align:right;'><b>%L3 lembar</b></td></tr>"
                        "<tr><td style='color:#444;'>Target Dana Terhimpun:</td>"
                        "<td style='text-align:right; color:#2E7D32;'><b>%4 GRD</b></td></tr>"
                        "<tr><td style='color:#444;'>Platform Fee (2%%):</td>"
                        "<td style='text-align:right; color:#C62828;'>- %5 GRD</td></tr>"
                        "<tr style='border-top:1px solid #ccc;'><td style='color:#333; font-weight:bold;'>Dana Diterima Creator:</td>"
                        "<td style='text-align:right; font-weight:bold; color:#1A237E;'>%6 GRD</td></tr>"
                        "</table>")
                .arg(presaleTokens).arg(alloc)
                .arg(supply - presaleTokens)
                .arg(QString::number(presaleRaise, 'f', 2))
                .arg(QString::number(platformFee, 'f', 2))
                .arg(QString::number(netRaise, 'f', 2)));
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onNext()
{
    if (step == 1) {
        if (fSymbol->text().trimmed().isEmpty()) {
            QMessageBox::warning(this, tr("Validasi"), tr("Simbol saham wajib diisi."));
            return;
        }
        if (fCompany->text().trimmed().length() < 3) {
            QMessageBox::warning(this, tr("Validasi"), tr("Nama perusahaan minimal 3 karakter."));
            return;
        }
    }
    if (step == 2) {
        if (fSupply->text().toLongLong() <= 0) {
            QMessageBox::warning(this, tr("Validasi"), tr("Total supply harus lebih dari 0."));
            return;
        }
        if (fPrice->text().toDouble() <= 0) {
            QMessageBox::warning(this, tr("Validasi"), tr("Harga per token harus lebih dari 0."));
            return;
        }
    }
    if (step == 3) {
        if (fIssuerAddr->currentText().trimmed().isEmpty()) {
            QMessageBox::warning(this, tr("Validasi"), tr("Pilih alamat penerbit dari wallet."));
            return;
        }
    }
    if (step < 4) {
        step++;
        stack->setCurrentIndex(step - 1);
        if (step == 4) buildReview();
        refreshStepBar();
    }
}

void CreateTokenPage::onPrev()
{
    if (step > 1) {
        step--;
        stack->setCurrentIndex(step - 1);
        refreshStepBar();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// REVIEW
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::buildReview()
{
    QString sym    = fSymbol->text().trimmed().toUpper();
    QString name   = fTokenName->text().trimmed();
    QString comp   = fCompany->text().trimmed();
    QString type   = fType->currentText();
    QString sector = fSector->currentText();
    qint64  supply = fSupply->text().toLongLong();
    double  price  = fPrice->text().toDouble();
    int     alloc  = fAllocSlider->value();
    QString dur    = fDuration->currentText();
    QString addr   = fIssuerAddr->currentText().trimmed();

    qint64 presaleTokens = static_cast<qint64>(supply * alloc / 100.0);
    double presaleRaise  = presaleTokens * price;
    double platformFee   = presaleRaise * PRESALE_FEE_PCT / 100.0;

    auto fmtN = [](qint64 v){ return QString("%L1").arg(v); };
    auto fmtD = [](double v){ return QString("%L1 GRD").arg(v, 0, 'f', 2); };

    QString social;
    auto addSocial = [&](const QString &icon, const QString &val) {
        if (!val.isEmpty()) social += QString("<br>%1 %2").arg(icon, val);
    };
    addSocial("🌐", fWebsite->text());
    addSocial("✖", fSocialX->text());
    addSocial("📸", fSocialIG->text());
    addSocial("▶", fSocialYT->text());
    addSocial("👍", fSocialFB->text());
    addSocial("💼", fSocialLI->text());
    addSocial("🎵", fSocialTT->text());

    QString html = QString(
        "<div style='font-family:sans-serif; font-size:12px;'>"

        "<div style='background:#8B0000; color:white; padding:12px; border-radius:6px; margin-bottom:10px;'>"
        "<div style='font-size:20px; font-weight:bold;'>%1</div>"
        "<div style='opacity:0.85;'>%2 &bull; %3 &bull; %4</div>"
        "</div>"

        "<table width='100%' cellpadding='5' style='border-collapse:collapse;'>"
        "<tr style='background:#f5f5f5;'><td colspan='2' style='font-weight:bold; color:#8B0000; padding:6px 8px;'>Info Perusahaan</td></tr>"
        "<tr><td style='color:#666; width:45%%;'>Nama Token</td><td><b>%5</b></td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Nama Perusahaan</td><td>%6</td></tr>"
        "<tr><td style='color:#666;'>Sektor</td><td>%7</td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Subsektor</td><td>%8</td></tr>"
        "<tr><td style='color:#666;'>Bidang Usaha</td><td>%9</td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Alamat</td><td>%10</td></tr>"
        "<tr><td style='color:#666;'>Media Sosial</td><td>%11</td></tr>"

        "<tr style='background:#f5f5f5;'><td colspan='2' style='font-weight:bold; color:#8B0000; padding:6px 8px;'>Penawaran Saham</td></tr>"
        "<tr><td style='color:#666;'>Total Supply</td><td><b>%12 lembar</b></td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Harga per Token</td><td><b>%13 GRD</b></td></tr>"
        "<tr><td style='color:#666;'>Alokasi Presale</td><td><b>%14%% → %15 lembar</b></td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Durasi Presale</td><td><b>%16</b></td></tr>"
        "<tr><td style='color:#666;'>Target Dana Presale</td><td style='color:#2E7D32; font-weight:bold;'>%17</td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Platform Fee (2%%)</td><td style='color:#C62828;'>%18</td></tr>"

        "<tr style='background:#f5f5f5;'><td colspan='2' style='font-weight:bold; color:#8B0000; padding:6px 8px;'>Aset Digital (IPFS via Pinata)</td></tr>"
        "<tr><td style='color:#666;'>Logo Perusahaan</td><td style='font-family:monospace; font-size:11px; color:#2E7D32;'>%19</td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Prospektus</td><td style='font-family:monospace; font-size:11px; color:#2E7D32;'>%20</td></tr>"
        "<tr><td style='color:#666;'>Legalitas</td><td style='font-family:monospace; font-size:11px; color:#2E7D32;'>%21</td></tr>"

        "<tr style='background:#f5f5f5;'><td colspan='2' style='font-weight:bold; color:#8B0000; padding:6px 8px;'>Biaya & Penerbit</td></tr>"
        "<tr><td style='color:#666;'>Biaya Deploy</td><td style='color:#C62828; font-weight:bold;'>%22 GRD (diambil dari wallet)</td></tr>"
        "<tr style='background:#fafafa;'><td style='color:#666;'>Alamat Penerbit</td><td style='font-family:monospace; font-size:11px;'>%23</td></tr>"
        "</table>"

        "<div style='background:#FFF3E0; border:1px solid #FFB74D; border-radius:6px; padding:10px; margin-top:10px;'>"
        "<b style='color:#E65100;'>⚠ Perhatian:</b> Setelah deploy, data token tidak dapat diubah. "
        "Pastikan semua informasi sudah benar sebelum melanjutkan."
        "</div></div>")
    .arg(sym, type, sector, fSubsector->text())           // 1-4
    .arg(name, comp, sector, fSubsector->text())           // 5-8
    .arg(fBusiness->text(), fCorpAddress->text())          // 9-10
    .arg(social.isEmpty() ? tr("(tidak diisi)") : social)  // 11
    .arg(fmtN(supply), QString::number(price, 'f', 2))     // 12-13
    .arg(alloc).arg(fmtN(presaleTokens))                   // 14-15
    .arg(dur, fmtD(presaleRaise), fmtD(platformFee))       // 16-18
    .arg(fLogoCid->text().isEmpty() ? tr("(belum diupload)") : fLogoCid->text())           // 19
    .arg(fProspektusCid->text().isEmpty() ? tr("(belum diupload)") : fProspektusCid->text()) // 20
    .arg(fLegalitasCid->text().isEmpty() ? tr("(belum diupload)") : fLegalitasCid->text())   // 21
    .arg(static_cast<int>(CREATION_FEE_GRD))               // 22
    .arg(addr);                                            // 23

    fReview->setHtml(html);
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPLOY
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onDeploy()
{
    QString sym   = fSymbol->text().trimmed().toUpper();
    QString name  = fTokenName->text().trimmed();
    QString addr  = fIssuerAddr->currentText().trimmed();
    qint64  supply = fSupply->text().toLongLong();

    if (!clientModel) {
        QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung."));
        return;
    }

    QMessageBox::StandardButton ok = QMessageBox::question(this,
        tr("Konfirmasi Deploy Token Saham"),
        tr("Deploy token <b>%1 (%2)</b>?\n\n"
           "• Supply: %3 lembar\n"
           "• Biaya deploy: %4 GRD\n"
           "• Alamat penerbit: %5...\n\n"
           "Lanjutkan?")
        .arg(name, sym)
        .arg(QString("%L1").arg(supply))
        .arg(static_cast<int>(CREATION_FEE_GRD))
        .arg(addr.left(20)),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);

    if (ok != QMessageBox::Yes) return;

    try {
        // RPC: issueasset <symbol> <name> <type> <total_supply> <address>
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(sym.toStdString()));
        params.push_back(UniValue(name.toStdString()));
        params.push_back(UniValue(std::string("saham")));
        params.push_back(UniValue(supply));
        params.push_back(UniValue(addr.toStdString()));

        UniValue result = clientModel->node().executeRpc("issueasset", params, "");
        QString assetId = QString::fromStdString(result["asset_id"].get_str());

        fReview->setHtml(QString(
            "<div style='background:#E8F5E9; border:2px solid #4CAF50; border-radius:8px; "
            "padding:16px; font-family:sans-serif;'>"
            "<h3 style='color:#2E7D32; margin:0 0 10px;'>🎉 TOKEN SAHAM BERHASIL DI-DEPLOY!</h3>"
            "<table>"
            "<tr><td style='color:#555; padding:3px 12px 3px 0;'>Simbol:</td><td><b style='font-size:16px;'>%1</b></td></tr>"
            "<tr><td style='color:#555; padding:3px 12px 3px 0;'>Nama:</td><td>%2</td></tr>"
            "<tr><td style='color:#555; padding:3px 12px 3px 0;'>Supply:</td><td>%3 lembar</td></tr>"
            "<tr><td style='color:#555; padding:3px 12px 3px 0;'>Asset ID:</td>"
            "<td style='font-family:monospace; font-size:11px;'>%4</td></tr>"
            "</table>"
            "<p style='color:#555; margin:10px 0 0; font-size:12px;'>"
            "✅ Token muncul di Explorer dan Website GarudaChain.<br>"
            "📋 Presale e-IPO akan aktif otomatis sesuai pengaturan.<br>"
            "💰 Setelah presale selesai, token listing di GarudaDEX."
            "</p></div>")
        .arg(sym, name)
        .arg(QString("%L1").arg(supply))
        .arg(assetId));

        deployBtn->setEnabled(false);
        divToken->addItem(QString("%1 — %2").arg(sym, assetId));

    } catch (const std::exception &e) {
        QMessageBox::critical(this, tr("Gagal Deploy"),
            tr("Error:\n%1").arg(QString::fromStdString(e.what())));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// DIVIDEN
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onPreviewDividend()
{
    QString token  = divToken->currentText();
    double  amount = divAmount->text().toDouble();
    if (token.isEmpty() || amount <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih token dan masukkan jumlah dividen."));
        return;
    }
    divResult->setHtml(QString(
        "<div style='background:#F0FFF0; border:2px solid #00AA00; border-radius:6px; "
        "padding:12px; font-family:sans-serif;'>"
        "<b style='color:#2E7D32; font-size:13px;'>Preview Distribusi Dividen</b><br><br>"
        "<b>Token:</b> %1<br>"
        "<b style='font-size:15px; color:#C00020;'>Total: %2 GRD</b><br>"
        "<small style='color:#666;'>Dibagi proporsional ke semua pemegang saham %1.<br>"
        "Jumlah per holder dihitung otomatis berdasarkan jumlah saham yang dipegang.</small>"
        "</div>").arg(token).arg(QString::number(amount, 'f', 4)));
}

void CreateTokenPage::onPayDividend()
{
    QString token  = divToken->currentText();
    double  amount = divAmount->text().toDouble();
    if (token.isEmpty() || amount <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih token dan masukkan jumlah dividen."));
        return;
    }
    auto reply = QMessageBox::question(this, tr("Konfirmasi Bayar Dividen"),
        tr("Bayar <b>%1 GRD</b> ke semua pemegang saham <b>%2</b>?\n\nAksi tidak dapat dibatalkan.")
        .arg(QString::number(amount, 'f', 2), token),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    divResult->setHtml(QString(
        "<div style='background:#E8F5E9; border:2px solid #4CAF50; border-radius:6px; "
        "padding:12px; font-family:sans-serif;'>"
        "<b style='color:#2E7D32; font-size:13px;'>✅ DIVIDEN BERHASIL DIBAYAR!</b><br><br>"
        "<span>%1 GRD didistribusikan ke semua pemegang saham <b>%2</b> secara otomatis.</span><br>"
        "<small style='color:#666;'>Mine 1 blok untuk konfirmasi semua transaksi dividen.</small>"
        "</div>").arg(QString::number(amount, 'f', 2), token));
}

// ══════════════════════════════════════════════════════════════════════════════
// e-IPO AKTIF
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onRefreshIPO()
{
    if (!clientModel) { ipoBrowser->setHtml("<p style='color:red;'>Node belum terhubung.</p>"); return; }
    try {
        UniValue result = clientModel->node().executeRpc("listpresales", UniValue(UniValue::VARR), "");
        if (!result.isArray() || result.size() == 0) {
            ipoBrowser->setHtml(
                "<div style='text-align:center; padding:40px; color:#888; font-family:sans-serif;'>"
                "<p style='font-size:28px;'>📋</p><p>Belum ada presale e-IPO aktif.</p>"
                "<p style='font-size:11px;'>Buat token saham dan atur presale di tab Buat Token Saham.</p>"
                "</div>");
            return;
        }
        QString html = "<div style='font-family:sans-serif; font-size:12px;'>";
        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &p = result[i];
            QString sym    = QString::fromStdString(p["symbol"].get_str());
            QString status = QString::fromStdString(p["status"].get_str());
            double sold    = p["tokens_sold"].get_real();
            double total   = p["tokens_for_sale"].get_real();
            double pct     = total > 0 ? sold / total * 100.0 : 0.0;
            double price   = p["price_grd"].get_real();
            double raised  = p["grd_raised"].get_real();
            bool isOpen    = (status == "OPEN");
            QString bg     = isOpen ? "#E8F5E9" : "#f5f5f5";
            QString scol   = isOpen ? "#2E7D32" : "#666";
            html += QString(
                "<div style='border:1px solid #ddd; border-radius:8px; padding:12px; "
                "margin-bottom:8px; background:%1;'>"
                "<div style='display:flex; justify-content:space-between;'>"
                "<b style='font-size:15px;'>%2</b>"
                "<span style='color:%3; font-weight:bold;'>● %4</span></div>"
                "<div style='background:#ddd; border-radius:4px; height:6px; margin:8px 0;'>"
                "<div style='background:#4CAF50; width:%5%%; height:6px; border-radius:4px;'></div></div>"
                "<table width='100%%'><tr>"
                "<td><small>Terjual</small><br><b>%6%%</b></td>"
                "<td><small>Harga</small><br><b>%7 GRD</b></td>"
                "<td><small>Terhimpun</small><br><b style='color:#8B0000;'>%8 GRD</b></td>"
                "</tr></table></div>")
            .arg(bg, sym, scol, status)
            .arg(QString::number(pct, 'f', 1))
            .arg(QString::number(pct, 'f', 1))
            .arg(QString::number(price, 'f', 4))
            .arg(QString::number(raised, 'f', 2));
        }
        html += "</div>";
        ipoBrowser->setHtml(html);
    } catch (...) {
        ipoBrowser->setHtml("<p style='color:#888;'>Data e-IPO tidak tersedia.</p>");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN LIST
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onRefreshTokens()
{
    if (!clientModel) { tokenBrowser->setHtml("<p style='color:red;'>Node belum terhubung.</p>"); return; }
    try {
        UniValue result = clientModel->node().executeRpc("listassets", UniValue(UniValue::VARR), "");
        if (!result.isArray() || result.size() == 0) {
            tokenBrowser->setHtml("<p style='color:#888; text-align:center; padding:20px;'>Belum ada token saham yang diterbitkan.</p>");
            return;
        }
        QString html =
            "<div style='font-family:sans-serif; font-size:12px;'>"
            "<table width='100%' style='border-collapse:collapse;'>"
            "<tr style='background:#8B0000; color:white;'>"
            "<th style='padding:8px 6px; text-align:left;'>Simbol</th>"
            "<th style='padding:8px 6px; text-align:left;'>Nama</th>"
            "<th style='padding:8px 6px; text-align:right;'>Supply</th>"
            "<th style='padding:8px 6px; text-align:left;'>Penerbit</th></tr>";
        divToken->clear();
        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &a = result[i];
            QString sym    = QString::fromStdString(a["symbol"].get_str());
            QString name   = QString::fromStdString(a["name"].get_str());
            QString supply = QString::fromStdString(a["total_supply"].getValStr());
            QString issuer = QString::fromStdString(a["creator"].get_str());
            QString assetId= QString::fromStdString(a["asset_id"].get_str());
            QString rowBg  = (i % 2 == 0) ? "#fff" : "#f9f9f9";
            html += QString(
                "<tr style='background:%1;'>"
                "<td style='padding:7px 6px; font-weight:bold;'>%2</td>"
                "<td style='padding:7px 6px;'>%3</td>"
                "<td style='padding:7px 6px; text-align:right; font-family:monospace;'>%4</td>"
                "<td style='padding:7px 6px; font-family:monospace; font-size:10px;'>%5...</td>"
                "</tr>")
            .arg(rowBg, sym, name, supply, issuer.left(14));
            divToken->addItem(QString("%1 — %2").arg(sym, assetId));
        }
        html += "</table></div>";
        tokenBrowser->setHtml(html);
    } catch (...) {
        tokenBrowser->setHtml("<p style='color:#888;'>Data token tidak tersedia.</p>");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD WALLET ADDRESSES
// ══════════════════════════════════════════════════════════════════════════════
void CreateTokenPage::onLoadAddresses() { loadAddresses(); }

void CreateTokenPage::loadAddresses()
{
    if (!clientModel) return;
    try {
        UniValue result = clientModel->node().executeRpc("listaddressgroupings", UniValue(UniValue::VARR), "");
        fIssuerAddr->clear();
        if (result.isArray()) {
            for (size_t g = 0; g < result.size(); ++g) {
                const UniValue &grp = result[g];
                if (grp.isArray()) {
                    for (size_t j = 0; j < grp.size(); ++j) {
                        const UniValue &e = grp[j];
                        if (e.isArray() && e.size() >= 1)
                            fIssuerAddr->addItem(QString::fromStdString(e[0].get_str()));
                    }
                }
            }
        }
        if (fIssuerAddr->count() == 0) {
            UniValue r2 = clientModel->node().executeRpc("getnewaddress", UniValue(UniValue::VARR), "");
            fIssuerAddr->addItem(QString::fromStdString(r2.get_str()));
        }
    } catch (...) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// IPFS UPLOAD via Pinata
// ══════════════════════════════════════════════════════════════════════════════
static const QString PINATA_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIxYTgxMjYxNi0zYTZiLTQ3ZDYtOGY0Ni1lM2Y1ZjY0MjUwNDEiLCJlbW"
    "FpbCI6InJlbnpvZ2FraUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdp"
    "b25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb2"
    "5Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJB"
    "Q1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiZWM5ZThjNzczZj"
    "Q3NDZjNzE1MWUiLCJzY29wZWRLZXlTZWNyZXQiOiIyMTY5YjQzMGEzNTUxMzg4YTM0OTE0NTM0MjcwMmY0MzZhMGU1"
    "YTdjYzk3NDk5MTZlOTA1OGFlMTI2OTYxZTNlIiwiZXhwIjoxODA2OTA1Mzg0fQ."
    "FxehvvdBTNk2g7EYAZ0lW9sqJjNyj752eFa5ThDns70";

void CreateTokenPage::uploadToIpfs(const QString &filePath, QLineEdit *cidTarget,
                                   QLabel *statusLabel, QPushButton *resetBtn, const QString &resetText)
{
    QFile *file = new QFile(filePath);
    if (!file->open(QIODevice::ReadOnly)) {
        delete file;
        QMessageBox::warning(this, tr("Upload Gagal"),
            tr("Tidak dapat membuka file:\n%1").arg(filePath));
        return;
    }

    if (statusLabel) statusLabel->setText(tr("Mengupload..."));
    cidTarget->setPlaceholderText(tr("Mengupload ke IPFS via Pinata..."));

    QHttpMultiPart *multiPart = new QHttpMultiPart(QHttpMultiPart::FormDataType);
    QHttpPart filePart;
    filePart.setHeader(QNetworkRequest::ContentDispositionHeader,
        QString("form-data; name=\"file\"; filename=\"%1\"")
        .arg(QFileInfo(filePath).fileName()));
    filePart.setBodyDevice(file);
    file->setParent(multiPart);
    multiPart->append(filePart);

    QNetworkRequest req(QUrl("https://api.pinata.cloud/pinning/pinFileToIPFS"));
    req.setRawHeader("Authorization", QString("Bearer %1").arg(PINATA_JWT).toUtf8());

    QNetworkReply *reply = m_nam->post(req, multiPart);
    multiPart->setParent(reply);

    connect(reply, &QNetworkReply::finished, this,
            [this, reply, cidTarget, statusLabel, resetBtn, resetText]() {
        reply->deleteLater();
        if (resetBtn && !resetText.isEmpty()) {
            resetBtn->setEnabled(true);
            resetBtn->setText(resetText);
        }
        if (reply->error() != QNetworkReply::NoError) {
            if (statusLabel) statusLabel->setText(tr("Gagal!"));
            QMessageBox::warning(this, tr("Upload Gagal"),
                tr("Error upload ke Pinata:\n%1").arg(reply->errorString()));
            cidTarget->setPlaceholderText(tr("Upload gagal. Coba lagi."));
            return;
        }
        QByteArray data = reply->readAll();
        QJsonObject obj = QJsonDocument::fromJson(data).object();
        QString cid = obj["IpfsHash"].toString();
        if (cid.isEmpty()) {
            if (statusLabel) statusLabel->setText(tr("Gagal!"));
            QMessageBox::warning(this, tr("Upload Gagal"),
                tr("Respons Pinata tidak valid:\n%1").arg(QString::fromUtf8(data)));
            return;
        }
        cidTarget->setText(cid);
        if (statusLabel) statusLabel->setText(tr("✓ Terupload"));
        // jika ada logo preview, tampilkan via gateway Pinata
        if (cidTarget == fLogoCid) {
            QUrl previewUrl(QString("https://gateway.pinata.cloud/ipfs/%1").arg(cid));
            QNetworkReply *imgReply = m_nam->get(QNetworkRequest(previewUrl));
            connect(imgReply, &QNetworkReply::finished, this, [this, imgReply]() {
                imgReply->deleteLater();
                if (imgReply->error() == QNetworkReply::NoError) {
                    QPixmap pix;
                    if (pix.loadFromData(imgReply->readAll())) {
                        fLogoPreview->setPixmap(
                            pix.scaled(80, 80, Qt::KeepAspectRatio, Qt::SmoothTransformation));
                        fLogoPreview->setText("");
                    }
                }
            });
        }
    });
}

void CreateTokenPage::onUploadLogo()
{
    QString path = QFileDialog::getOpenFileName(this,
        tr("Pilih Logo Perusahaan"),
        QDir::homePath(),
        tr("Gambar (*.png *.jpg *.jpeg *.svg *.webp)"));
    if (path.isEmpty()) return;

    QFileInfo fi(path);
    if (fi.size() > 5 * 1024 * 1024) {
        QMessageBox::warning(this, tr("File Terlalu Besar"),
            tr("Ukuran logo maksimal 5MB. File ini %1 MB.")
            .arg(QString::number(fi.size() / 1024.0 / 1024.0, 'f', 1)));
        return;
    }
    // tampilkan preview lokal dulu (sebelum upload selesai)
    QPixmap pix(path);
    if (!pix.isNull()) {
        fLogoPreview->setPixmap(
            pix.scaled(80, 80, Qt::KeepAspectRatio, Qt::SmoothTransformation));
        fLogoPreview->setText("");
    }
    uploadToIpfs(path, fLogoCid, nullptr);
}

void CreateTokenPage::onUploadProspektus()
{
    QString path = QFileDialog::getOpenFileName(this,
        tr("Pilih Prospektus"),
        QDir::homePath(),
        tr("Dokumen (*.pdf *.doc *.docx)"));
    if (path.isEmpty()) return;

    QFileInfo fi(path);
    if (fi.size() > 50 * 1024 * 1024) {
        QMessageBox::warning(this, tr("File Terlalu Besar"),
            tr("Ukuran prospektus maksimal 50MB."));
        return;
    }
    fProspektusUploadBtn->setEnabled(false);
    fProspektusUploadBtn->setText(tr("Mengupload..."));
    uploadToIpfs(path, fProspektusCid, nullptr,
                 fProspektusUploadBtn, tr("📄 Upload Prospektus (PDF)"));
}

void CreateTokenPage::onUploadLegalitas()
{
    QString path = QFileDialog::getOpenFileName(this,
        tr("Pilih Dokumen Legalitas"),
        QDir::homePath(),
        tr("Dokumen (*.pdf *.zip *.rar *.doc *.docx)"));
    if (path.isEmpty()) return;

    QFileInfo fi(path);
    if (fi.size() > 50 * 1024 * 1024) {
        QMessageBox::warning(this, tr("File Terlalu Besar"),
            tr("Ukuran dokumen legalitas maksimal 50MB."));
        return;
    }
    fLegalitasUploadBtn->setEnabled(false);
    fLegalitasUploadBtn->setText(tr("Mengupload..."));
    uploadToIpfs(path, fLegalitasCid, nullptr,
                 fLegalitasUploadBtn, tr("📋 Upload Legalitas (PDF/ZIP)"));
}
