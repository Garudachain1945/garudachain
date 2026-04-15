// Copyright (c) 2026 GarudaChain developers
// Mint/Burn page for CBDC wallet mode (native GRD + stablecoin)
#include <qt/mintburnpage.h>
#include <qt/clientmodel.h>
#include <qt/walletmodel.h>
#include <qt/platformstyle.h>
#include <interfaces/node.h>
#include <univalue.h>

#include <QComboBox>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
#include <QFormLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QHttpMultiPart>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPixmap>
#include <QPushButton>
#include <QSpinBox>
#include <QTabWidget>
#include <QTextBrowser>
#include <QVBoxLayout>

MintBurnPage::MintBurnPage(const PlatformStyle *_platformStyle, QWidget *parent)
    : QWidget(parent), platformStyle(_platformStyle)
{
    m_nam = new QNetworkAccessManager(this);
    setupUI();
}

void MintBurnPage::setClientModel(ClientModel *m) { clientModel = m; }
void MintBurnPage::setWalletModel(WalletModel *m) { walletModel = m; }

void MintBurnPage::setupUI()
{
    QVBoxLayout *root = new QVBoxLayout(this);
    root->setContentsMargins(6, 6, 6, 6);

    QLabel *header = new QLabel(
        "<h2 style='color:#8B0000; margin:0;'>CBDC Authority — Mint &amp; Burn</h2>"
        "<p style='color:#666; font-size:12px; margin:2px 0 6px;'>Bank Sentral Digital: kelola supply GRD native dan stablecoin GarudaChain.</p>");
    header->setWordWrap(true);
    root->addWidget(header);

    tabWidget = new QTabWidget(this);
    tabWidget->setUsesScrollButtons(false);
    tabWidget->setStyleSheet(
        "QTabBar::tab { padding: 7px 16px; font-weight: bold; min-width: 130px; }"
        "QTabBar::tab:selected { color: #8B0000; border-bottom: 2px solid #8B0000; }");

    // ══ TAB 0: Mint / Burn GRD Native ════════════════════════════════════
    QWidget *grdTab = new QWidget();
    QVBoxLayout *grdL = new QVBoxLayout(grdTab);

    // — Mint GRD —
    QGroupBox *mintGRDGrp = new QGroupBox(tr("Mint GRD — Cetak Koin Native Baru"));
    mintGRDGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#1A237E; border:2px solid #1A237E; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *mintGRDF = new QFormLayout(mintGRDGrp);

    mintGRDAmountEdit = new QLineEdit();
    mintGRDAmountEdit->setPlaceholderText("1000.00");
    mintGRDF->addRow(tr("Jumlah GRD:"), mintGRDAmountEdit);

    mintGRDPrivKeyEdit = new QLineEdit();
    mintGRDPrivKeyEdit->setPlaceholderText(tr("Authority private key (hex)"));
    mintGRDPrivKeyEdit->setEchoMode(QLineEdit::Password);
    mintGRDF->addRow(tr("Authority Key:"), mintGRDPrivKeyEdit);

    mintGRDBtn = new QPushButton(tr("Mint GRD"));
    mintGRDBtn->setStyleSheet(
        "QPushButton { background:#1A237E; color:white; font-weight:bold; "
        "padding:8px 16px; border-radius:4px; }"
        "QPushButton:hover { background:#283593; }");
    mintGRDF->addRow(mintGRDBtn);
    grdL->addWidget(mintGRDGrp);
    grdL->addSpacing(8);

    // — Burn GRD —
    QGroupBox *burnGRDGrp = new QGroupBox(tr("Burn GRD — Musnahkan Koin dari Peredaran"));
    burnGRDGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#B71C1C; border:2px solid #B71C1C; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *burnGRDF = new QFormLayout(burnGRDGrp);

    burnGRDAmountEdit = new QLineEdit();
    burnGRDAmountEdit->setPlaceholderText("1000.00");
    burnGRDF->addRow(tr("Jumlah GRD:"), burnGRDAmountEdit);

    burnGRDPrivKeyEdit = new QLineEdit();
    burnGRDPrivKeyEdit->setPlaceholderText(tr("Authority private key (hex)"));
    burnGRDPrivKeyEdit->setEchoMode(QLineEdit::Password);
    burnGRDF->addRow(tr("Authority Key:"), burnGRDPrivKeyEdit);

    burnGRDBtn = new QPushButton(tr("Burn GRD"));
    burnGRDBtn->setStyleSheet(
        "QPushButton { background:#B71C1C; color:white; font-weight:bold; "
        "padding:8px 16px; border-radius:4px; }"
        "QPushButton:hover { background:#C62828; }");
    burnGRDF->addRow(burnGRDBtn);
    grdL->addWidget(burnGRDGrp);

    grdStatusBrowser = new QTextBrowser();
    grdStatusBrowser->setMaximumHeight(90);
    grdStatusBrowser->setHtml("<p style='color:#888; font-size:12px;'>Status operasi muncul di sini.</p>");
    grdL->addWidget(grdStatusBrowser);
    grdL->addStretch();

    tabWidget->addTab(grdTab, tr("Mint / Burn GRD"));

    // ══ TAB 1: Stablecoin Orderbook ══════════════════════════════════════
    {
    QWidget *obTab = new QWidget();
    QVBoxLayout *obL = new QVBoxLayout(obTab);

    QLabel *obHdr = new QLabel(
        "<h3 style='color:#2E7D32; margin:0;'>Stablecoin Orderbook (Harga Pasar)</h3>"
        "<p style='color:#666; font-size:12px;'>Stablecoin dengan harga ditentukan oleh supply/demand "
        "di pasar blockchain. Diperdagangkan di DEX orderbook.</p>");
    obHdr->setWordWrap(true);
    obL->addWidget(obHdr);

    // Issue form
    QGroupBox *obIssueGrp = new QGroupBox(tr("Terbitkan Stablecoin Orderbook Baru"));
    obIssueGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#2E7D32; border:2px solid #2E7D32; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *obIssueF = new QFormLayout(obIssueGrp);

    obSymbolEdit = new QLineEdit();
    obSymbolEdit->setPlaceholderText("IDR, USD, EUR, MYR...");
    obSymbolEdit->setMaxLength(10);
    obIssueF->addRow(tr("Simbol:"), obSymbolEdit);

    obNameEdit = new QLineEdit();
    obNameEdit->setPlaceholderText("Garuda IDR");
    obIssueF->addRow(tr("Nama:"), obNameEdit);

    obSupplyEdit = new QLineEdit("999999999999999");
    obIssueF->addRow(tr("Total Supply:"), obSupplyEdit);

    // Logo upload
    QHBoxLayout *logoRow = new QHBoxLayout();
    obLogoPreview = new QLabel();
    obLogoPreview->setFixedSize(72, 72);
    obLogoPreview->setStyleSheet(
        "border: 2px dashed #ccc; border-radius: 6px; background: #f9f9f9;");
    obLogoPreview->setAlignment(Qt::AlignCenter);
    obLogoPreview->setText(tr("Logo"));
    QVBoxLayout *logoRight = new QVBoxLayout();
    obLogoUploadBtn = new QPushButton(tr("Pilih Logo Stablecoin..."));
    obLogoUploadBtn->setStyleSheet(
        "QPushButton { background:#37474F; color:white; font-weight:bold; "
        "padding:5px 12px; border-radius:4px; }"
        "QPushButton:hover { background:#455A64; }");
    obLogoCidEdit = new QLineEdit();
    obLogoCidEdit->setPlaceholderText(tr("IPFS CID logo (otomatis setelah upload)..."));
    obLogoCidEdit->setReadOnly(true);
    obLogoCidEdit->setStyleSheet("color:#2E7D32; font-family:monospace; font-size:11px;");
    QLabel *logoNote = new QLabel(
        tr("<small style='color:#666;'>PNG/JPG/SVG, maks 5MB. Diunggah ke IPFS via Pinata.</small>"));
    logoNote->setWordWrap(true);
    logoRight->addWidget(obLogoUploadBtn);
    logoRight->addWidget(obLogoCidEdit);
    logoRight->addWidget(logoNote);
    logoRow->addWidget(obLogoPreview);
    logoRow->addLayout(logoRight, 1);
    QWidget *logoW = new QWidget(); logoW->setLayout(logoRow);
    obIssueF->addRow(tr("Logo:"), logoW);

    // Set shared pointers for upload
    logoPreview = obLogoPreview;
    logoUploadBtn = obLogoUploadBtn;
    logoCidEdit = obLogoCidEdit;

    obIssueBtn = new QPushButton(tr("Terbitkan Stablecoin Orderbook"));
    obIssueBtn->setStyleSheet(
        "QPushButton { background:#2E7D32; color:white; font-weight:bold; "
        "padding:8px 16px; border-radius:4px; }"
        "QPushButton:hover { background:#388E3C; }");
    obIssueF->addRow(obIssueBtn);
    obL->addWidget(obIssueGrp);
    obL->addSpacing(8);

    // Mint supply
    QGroupBox *obMintGrp = new QGroupBox(tr("Mint Supply Orderbook"));
    obMintGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#2E7D32; border:1px solid #2E7D32; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *obMintF = new QFormLayout(obMintGrp);
    obMintCombo = new QComboBox();
    obMintCombo->setPlaceholderText(tr("Pilih stablecoin..."));
    obMintF->addRow(tr("Stablecoin:"), obMintCombo);
    obMintAmountEdit = new QLineEdit();
    obMintAmountEdit->setPlaceholderText("1000000");
    obMintF->addRow(tr("Jumlah Mint:"), obMintAmountEdit);
    obMintBtn = new QPushButton(tr("Mint Supply"));
    obMintBtn->setStyleSheet(
        "QPushButton { background:#2E7D32; color:white; font-weight:bold; padding:6px 14px; border-radius:4px; }");
    obMintF->addRow(obMintBtn);
    obL->addWidget(obMintGrp);
    obL->addSpacing(4);

    // Burn supply
    QGroupBox *obBurnGrp = new QGroupBox(tr("Burn Supply Orderbook"));
    obBurnGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#C62828; border:1px solid #C62828; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *obBurnF = new QFormLayout(obBurnGrp);
    obBurnCombo = new QComboBox();
    obBurnCombo->setPlaceholderText(tr("Pilih stablecoin..."));
    obBurnF->addRow(tr("Stablecoin:"), obBurnCombo);
    obBurnAmountEdit = new QLineEdit();
    obBurnAmountEdit->setPlaceholderText("500000");
    obBurnF->addRow(tr("Jumlah Burn:"), obBurnAmountEdit);
    obBurnBtn = new QPushButton(tr("Burn Supply"));
    obBurnBtn->setStyleSheet(
        "QPushButton { background:#C62828; color:white; font-weight:bold; padding:6px 14px; border-radius:4px; }");
    obBurnF->addRow(obBurnBtn);
    obL->addWidget(obBurnGrp);
    obL->addStretch();

    tabWidget->addTab(obTab, tr("Stablecoin Orderbook"));
    }

    // ══ TAB 2: Stablecoin Oracle ═════════════════════════════════════════
    {
    QWidget *orTab = new QWidget();
    QVBoxLayout *orL = new QVBoxLayout(orTab);

    QLabel *orHdr = new QLabel(
        "<h3 style='color:#1565C0; margin:0;'>Stablecoin Oracle (Harga Dunia Nyata)</h3>"
        "<p style='color:#666; font-size:12px;'>Stablecoin dengan harga mengikuti kurs dunia nyata real-time. "
        "Harga ditentukan oleh median 3 sumber oracle. Simbol otomatis diberi prefix 'p' (contoh: pIDR, pUSD).</p>");
    orHdr->setWordWrap(true);
    orL->addWidget(orHdr);

    // Issue form
    QGroupBox *orIssueGrp = new QGroupBox(tr("Terbitkan Stablecoin Oracle Baru"));
    orIssueGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#1565C0; border:2px solid #1565C0; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *orIssueF = new QFormLayout(orIssueGrp);

    orPegCurrencyEdit = new QLineEdit();
    orPegCurrencyEdit->setPlaceholderText("IDR, USD, JPY, EUR, MYR, GBP...");
    orPegCurrencyEdit->setMaxLength(5);
    orIssueF->addRow(tr("Kode Mata Uang ISO:"), orPegCurrencyEdit);

    orSymbolEdit = new QLineEdit();
    orSymbolEdit->setPlaceholderText("Otomatis: pIDR, pUSD, pJPY...");
    orSymbolEdit->setReadOnly(true);
    orSymbolEdit->setStyleSheet("background:#E3F2FD; color:#1565C0; font-weight:bold;");
    orIssueF->addRow(tr("Simbol (auto):"), orSymbolEdit);

    orNameEdit = new QLineEdit();
    orNameEdit->setPlaceholderText("Pegged IDR, Pegged USD...");
    orIssueF->addRow(tr("Nama:"), orNameEdit);

    orSupplyEdit = new QLineEdit("999999999999999");
    orIssueF->addRow(tr("Total Supply:"), orSupplyEdit);

    QLabel *orNote = new QLabel(
        tr("<div style='background:#E3F2FD; border:1px solid #90CAF9; border-radius:6px; padding:8px; margin:4px 0;'>"
           "<b style='color:#1565C0;'>Info Oracle:</b><br>"
           "- Harga mengikuti kurs real-time dari oracle (median 3 sumber)<br>"
           "- Simbol otomatis mendapat prefix 'p' (pIDR, pUSD, pEUR)<br>"
           "- Cocok untuk pembayaran, remitansi, dan forex on-chain"
           "</div>"));
    orNote->setWordWrap(true);
    orIssueF->addRow(orNote);

    orIssueBtn = new QPushButton(tr("Terbitkan Stablecoin Oracle"));
    orIssueBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; "
        "padding:8px 16px; border-radius:4px; }"
        "QPushButton:hover { background:#1976D2; }");
    orIssueF->addRow(orIssueBtn);
    orL->addWidget(orIssueGrp);
    orL->addSpacing(8);

    // Mint supply
    QGroupBox *orMintGrp = new QGroupBox(tr("Mint Supply Oracle"));
    orMintGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#1565C0; border:1px solid #1565C0; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *orMintF = new QFormLayout(orMintGrp);
    orMintCombo = new QComboBox();
    orMintCombo->setPlaceholderText(tr("Pilih stablecoin oracle..."));
    orMintF->addRow(tr("Stablecoin:"), orMintCombo);
    orMintAmountEdit = new QLineEdit();
    orMintAmountEdit->setPlaceholderText("1000000");
    orMintF->addRow(tr("Jumlah Mint:"), orMintAmountEdit);
    orMintBtn = new QPushButton(tr("Mint Supply"));
    orMintBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; padding:6px 14px; border-radius:4px; }");
    orMintF->addRow(orMintBtn);
    orL->addWidget(orMintGrp);
    orL->addSpacing(4);

    // Burn supply
    QGroupBox *orBurnGrp = new QGroupBox(tr("Burn Supply Oracle"));
    orBurnGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#C62828; border:1px solid #C62828; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *orBurnF = new QFormLayout(orBurnGrp);
    orBurnCombo = new QComboBox();
    orBurnCombo->setPlaceholderText(tr("Pilih stablecoin oracle..."));
    orBurnF->addRow(tr("Stablecoin:"), orBurnCombo);
    orBurnAmountEdit = new QLineEdit();
    orBurnAmountEdit->setPlaceholderText("500000");
    orBurnF->addRow(tr("Jumlah Burn:"), orBurnAmountEdit);
    orBurnBtn = new QPushButton(tr("Burn Supply"));
    orBurnBtn->setStyleSheet(
        "QPushButton { background:#C62828; color:white; font-weight:bold; padding:6px 14px; border-radius:4px; }");
    orBurnF->addRow(orBurnBtn);
    orL->addWidget(orBurnGrp);
    orL->addStretch();

    tabWidget->addTab(orTab, tr("Stablecoin Oracle"));
    }

    // ══ TAB 3: Stablecoin Aktif ════════════════════════════════════════════
    QWidget *listTab = new QWidget();
    QVBoxLayout *listL = new QVBoxLayout(listTab);

    refreshBtn = new QPushButton(tr("Refresh Daftar Stablecoin"));
    refreshBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; "
        "padding:6px 14px; border-radius:4px; }");
    listL->addWidget(refreshBtn);

    infoBrowser = new QTextBrowser();
    infoBrowser->setOpenExternalLinks(false);
    infoBrowser->setHtml("<p style='color:#888;'>Klik Refresh untuk memuat daftar stablecoin.</p>");
    listL->addWidget(infoBrowser);

    tabWidget->addTab(listTab, tr("Stablecoin Aktif"));

    root->addWidget(tabWidget);

    // Auto-fill oracle symbol when currency code changes
    connect(orPegCurrencyEdit, &QLineEdit::textChanged, this, [this](const QString &text) {
        QString code = text.trimmed().toUpper();
        if (!code.isEmpty()) {
            orSymbolEdit->setText("p" + code);
            if (orNameEdit->text().trimmed().isEmpty()) {
                orNameEdit->setText("Pegged " + code);
            }
        } else {
            orSymbolEdit->clear();
        }
    });

    // Load combos when switching tabs
    connect(tabWidget, &QTabWidget::currentChanged, this, [this](int idx) {
        if (idx == 1) { loadAssetCombo(obMintCombo, "stablecoin"); loadAssetCombo(obBurnCombo, "stablecoin"); }
        if (idx == 2) { loadAssetCombo(orMintCombo, "stablecoin_pegged"); loadAssetCombo(orBurnCombo, "stablecoin_pegged"); }
    });

    // Connections
    connect(mintGRDBtn,       &QPushButton::clicked, this, &MintBurnPage::onMintGRD);
    connect(burnGRDBtn,       &QPushButton::clicked, this, &MintBurnPage::onBurnGRD);
    connect(obIssueBtn,       &QPushButton::clicked, this, &MintBurnPage::onIssueOrderbook);
    connect(obLogoUploadBtn,  &QPushButton::clicked, this, &MintBurnPage::onUploadStablecoinLogo);
    connect(obMintBtn,        &QPushButton::clicked, this, &MintBurnPage::onMintOrderbook);
    connect(obBurnBtn,        &QPushButton::clicked, this, &MintBurnPage::onBurnOrderbook);
    connect(orIssueBtn,       &QPushButton::clicked, this, &MintBurnPage::onIssueOracle);
    connect(orMintBtn,        &QPushButton::clicked, this, &MintBurnPage::onMintOracle);
    connect(orBurnBtn,        &QPushButton::clicked, this, &MintBurnPage::onBurnOracle);
    connect(refreshBtn,       &QPushButton::clicked, this, &MintBurnPage::onRefreshList);
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD WALLET ADDRESSES
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::loadWalletAddresses(QComboBox *combo)
{
    if (!clientModel || !combo) return;
    try {
        UniValue result = clientModel->node().executeRpc(
            "listaddressgroupings", UniValue(UniValue::VARR), "");
        combo->clear();
        if (result.isArray()) {
            for (size_t g = 0; g < result.size(); ++g) {
                const UniValue &grp = result[g];
                if (grp.isArray()) {
                    for (size_t j = 0; j < grp.size(); ++j) {
                        const UniValue &e = grp[j];
                        if (e.isArray() && e.size() >= 1)
                            combo->addItem(QString::fromStdString(e[0].get_str()));
                    }
                }
            }
        }
        if (combo->count() == 0) {
            UniValue r2 = clientModel->node().executeRpc(
                "getnewaddress", UniValue(UniValue::VARR), "");
            combo->addItem(QString::fromStdString(r2.get_str()));
        }
    } catch (...) {}
}

void MintBurnPage::onLoadWalletAddresses()
{
    // No longer needed - addresses auto-generated
}

// ══════════════════════════════════════════════════════════════════════════════
// MINT / BURN GRD
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::onMintGRD()
{
    QString amount = mintGRDAmountEdit->text().trimmed();
    QString key    = mintGRDPrivKeyEdit->text().trimmed();

    if (amount.toDouble() <= 0 || key.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Jumlah dan authority key wajib diisi."));
        return;
    }
    if (!clientModel) { QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return; }

    try {
        UniValue addrResult = clientModel->node().executeRpc(
            "getnewaddress", UniValue(UniValue::VARR), "");
        QString addr = QString::fromStdString(addrResult.get_str());

        UniValue params(UniValue::VARR);
        params.push_back(UniValue(addr.toStdString()));
        params.push_back(UniValue(amount.toStdString()));
        params.push_back(UniValue(key.toStdString()));

        UniValue result = clientModel->node().executeRpc("mintgaruda", params, "");
        QString txid = QString::fromStdString(result.get_str());

        grdStatusBrowser->setHtml(QString(
            "<div style='background:#E8F5E9; border:2px solid #2E7D32; border-radius:6px; padding:10px;'>"
            "<b style='color:#2E7D32;'>MINT GRD BERHASIL!</b><br>"
            "<small>TXID: <code>%1</code></small><br>"
            "<small><b>%2 GRD</b> dicetak ke wallet.</small>"
            "</div>").arg(txid, amount));

    } catch (const std::exception &e) {
        grdStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #C62828; border-radius:6px; padding:10px;'>"
            "<b style='color:#C62828;'>Error:</b> %1</div>")
            .arg(QString::fromStdString(e.what())));
    }
}

void MintBurnPage::onBurnGRD()
{
    QString amount = burnGRDAmountEdit->text().trimmed();
    QString key    = burnGRDPrivKeyEdit->text().trimmed();

    if (amount.toDouble() <= 0 || key.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Jumlah dan authority key wajib diisi."));
        return;
    }

    auto reply = QMessageBox::question(this, tr("Konfirmasi Burn GRD"),
        tr("Bakar <b>%1 GRD</b> secara permanen?\n\nTIDAK DAPAT DIBATALKAN.").arg(amount),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    if (!clientModel) { QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return; }

    try {
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(amount.toStdString()));
        params.push_back(UniValue(key.toStdString()));

        UniValue result = clientModel->node().executeRpc("burngaruda", params, "");
        QString btxid = QString::fromStdString(result.get_str());

        grdStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #B71C1C; border-radius:6px; padding:10px;'>"
            "<b style='color:#B71C1C;'>BURN GRD BERHASIL!</b><br>"
            "<small>TXID: <code>%1</code></small><br>"
            "<small><b>%2 GRD</b> telah dimusnahkan.</small>"
            "</div>").arg(btxid, amount));

    } catch (const std::exception &e) {
        grdStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #C62828; border-radius:6px; padding:10px;'>"
            "<b style='color:#C62828;'>Error:</b> %1</div>")
            .arg(QString::fromStdString(e.what())));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: ISSUE STABLECOIN
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::issueStablecoin(const QString &symbol, const QString &name,
                                    const QString &type, const QString &supply,
                                    const QString &pegCurrency)
{
    if (!clientModel) {
        QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung."));
        return;
    }

    try {
        UniValue addrResult = clientModel->node().executeRpc(
            "getnewaddress", UniValue(UniValue::VARR), "");
        QString addr = QString::fromStdString(addrResult.get_str());

        UniValue params(UniValue::VARR);
        params.push_back(UniValue(symbol.toStdString()));
        params.push_back(UniValue(name.toStdString()));
        params.push_back(UniValue(type.toStdString()));
        params.push_back(UniValue(supply.toLongLong()));
        params.push_back(UniValue(addr.toStdString()));
        params.push_back(UniValue());  // face_value
        params.push_back(UniValue());  // maturity
        params.push_back(UniValue());  // coupon
        params.push_back(UniValue());  // nav
        params.push_back(UniValue(1.0));
        params.push_back(UniValue(pegCurrency.toStdString()));

        UniValue result = clientModel->node().executeRpc("issueasset", params, "");
        QString assetId = QString::fromStdString(result["asset_id"].get_str());

        bool isOracle = (type == "stablecoin_pegged");
        QString typeLabel = isOracle ? "Stablecoin Oracle" : "Stablecoin Orderbook";
        QString bgColor   = isOracle ? "#E3F2FD" : "#E8F5E9";
        QString bdColor   = isOracle ? "#1976D2" : "#4CAF50";
        QString txColor   = isOracle ? "#1565C0" : "#2E7D32";

        QMessageBox::information(this, tr("Stablecoin Diterbitkan"),
            QString("<div style='background:%1; border:2px solid %2; border-radius:6px; padding:12px;'>"
                    "<b style='color:%3; font-size:13px;'>STABLECOIN BERHASIL DITERBITKAN!</b><br><br>"
                    "<b>Tipe:</b> %4<br>"
                    "<b>Simbol:</b> %5<br><b>Nama:</b> %6<br>"
                    "<b>Supply:</b> %7<br>"
                    "<b>Asset ID:</b> <code style='font-size:11px;'>%8</code><br><br>"
                    "<small style='color:#666;'>Mine 1 blok untuk konfirmasi.</small></div>")
            .arg(bgColor, bdColor, txColor, typeLabel,
                 symbol, name, QString("%L1").arg(supply.toLongLong()), assetId));

        onRefreshList();

    } catch (const std::exception &e) {
        QMessageBox::critical(this, tr("Error"),
            tr("Gagal menerbitkan stablecoin:\n%1").arg(QString::fromStdString(e.what())));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD ASSET COMBO (populate dropdown with stablecoins by type)
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::loadAssetCombo(QComboBox *combo, const QString &filterType)
{
    if (!clientModel || !combo) return;
    QString prev = combo->currentData().toString();
    combo->clear();
    try {
        UniValue result = clientModel->node().executeRpc(
            "listassets", UniValue(UniValue::VARR), "");
        if (!result.isArray()) return;
        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &a = result[i];
            QString type = a.exists("type") ? QString::fromStdString(a["type"].get_str()) : "stablecoin";
            if (type != filterType) continue;
            QString sym = QString::fromStdString(a["symbol"].get_str());
            QString aid = QString::fromStdString(a["asset_id"].get_str());
            QString name = QString::fromStdString(a["name"].get_str());
            combo->addItem(QString("%1 — %2").arg(sym, name), aid);
        }
        // Restore previous selection
        if (!prev.isEmpty()) {
            int idx = combo->findData(prev);
            if (idx >= 0) combo->setCurrentIndex(idx);
        }
    } catch (...) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: MINT / BURN SUPPLY (combo-based, address auto from wallet)
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::doMint(QComboBox *combo, QLineEdit *amountEdit)
{
    if (combo->currentIndex() < 0) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih stablecoin terlebih dahulu."));
        return;
    }
    QString assetId = combo->currentData().toString();
    QString label   = combo->currentText();
    QString amount  = amountEdit->text().trimmed();

    if (amount.toLongLong() <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Jumlah mint harus positif."));
        return;
    }
    if (!clientModel) { QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return; }

    try {
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(assetId.toStdString()));
        params.push_back(UniValue(amount.toLongLong()));
        clientModel->node().executeRpc("mintasset", params, "");

        QMessageBox::information(this, tr("Mint Berhasil"),
            tr("<b>%1</b> token berhasil ditambahkan ke supply <b>%2</b>.<br>"
               "<small>Mine 1 blok untuk konfirmasi.</small>").arg(amount, label));
        onRefreshList();
    } catch (const std::exception &e) {
        QMessageBox::critical(this, tr("Error"), tr("Gagal mint:\n%1").arg(QString::fromStdString(e.what())));
    }
}

void MintBurnPage::doBurn(QComboBox *combo, QLineEdit *amountEdit)
{
    if (combo->currentIndex() < 0) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih stablecoin terlebih dahulu."));
        return;
    }
    QString assetId = combo->currentData().toString();
    QString label   = combo->currentText();
    QString amount  = amountEdit->text().trimmed();

    if (amount.toLongLong() <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Jumlah burn harus positif."));
        return;
    }

    auto reply = QMessageBox::question(this, tr("Konfirmasi Burn"),
        tr("Bakar <b>%1</b> token dari <b>%2</b>?\n\nAksi ini tidak dapat dibatalkan.")
        .arg(amount, label),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    if (!clientModel) { QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return; }

    try {
        // Auto-get address from wallet
        UniValue addrResult = clientModel->node().executeRpc(
            "getnewaddress", UniValue(UniValue::VARR), "");
        QString addr = QString::fromStdString(addrResult.get_str());

        UniValue params(UniValue::VARR);
        params.push_back(UniValue(assetId.toStdString()));
        params.push_back(UniValue(amount.toLongLong()));
        params.push_back(UniValue(addr.toStdString()));
        clientModel->node().executeRpc("burnasset", params, "");

        QMessageBox::information(this, tr("Burn Berhasil"),
            tr("<b>%1</b> token dari <b>%2</b> telah dimusnahkan.").arg(amount, label));
        onRefreshList();
    } catch (const std::exception &e) {
        QMessageBox::critical(this, tr("Error"), tr("Gagal burn:\n%1").arg(QString::fromStdString(e.what())));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// STABLECOIN ORDERBOOK HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::onIssueOrderbook()
{
    QString sym    = obSymbolEdit->text().trimmed().toUpper();
    QString name   = obNameEdit->text().trimmed();
    QString supply = obSupplyEdit->text().trimmed();

    if (sym.isEmpty() || name.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Simbol dan nama wajib diisi."));
        return;
    }
    if (supply.toLongLong() <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Total supply harus positif."));
        return;
    }

    auto reply = QMessageBox::question(this, tr("Konfirmasi"),
        tr("Terbitkan stablecoin orderbook?\n\nSimbol: %1\nNama: %2\nSupply: %3")
        .arg(sym, name, supply),
        QMessageBox::Yes | QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    issueStablecoin(sym, name, "stablecoin", supply, sym);
}

void MintBurnPage::onMintOrderbook()  { doMint(obMintCombo, obMintAmountEdit); }
void MintBurnPage::onBurnOrderbook()  { doBurn(obBurnCombo, obBurnAmountEdit); }

// ══════════════════════════════════════════════════════════════════════════════
// STABLECOIN ORACLE HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::onIssueOracle()
{
    QString pegCurrency = orPegCurrencyEdit->text().trimmed().toUpper();
    QString sym         = orSymbolEdit->text().trimmed();
    QString name        = orNameEdit->text().trimmed();
    QString supply      = orSupplyEdit->text().trimmed();

    if (pegCurrency.isEmpty()) {
        QMessageBox::warning(this, tr("Error"),
            tr("Kode mata uang ISO wajib diisi.\nContoh: IDR, USD, EUR, MYR, GBP"));
        return;
    }
    if (sym.isEmpty() || name.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Simbol dan nama wajib diisi."));
        return;
    }
    if (supply.toLongLong() <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Total supply harus positif."));
        return;
    }

    auto reply = QMessageBox::question(this, tr("Konfirmasi"),
        tr("Terbitkan stablecoin oracle?\n\nSimbol: %1\nNama: %2\nPeg Currency: %3\nSupply: %4")
        .arg(sym, name, pegCurrency, supply),
        QMessageBox::Yes | QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    issueStablecoin(sym, name, "stablecoin_pegged", supply, pegCurrency);
}

void MintBurnPage::onMintOracle()  { doMint(orMintCombo, orMintAmountEdit); }
void MintBurnPage::onBurnOracle()  { doBurn(orBurnCombo, orBurnAmountEdit); }

// ══════════════════════════════════════════════════════════════════════════════
// REFRESH STABLECOIN LIST
// ══════════════════════════════════════════════════════════════════════════════
void MintBurnPage::onRefreshList()
{
    if (!clientModel) {
        infoBrowser->setHtml("<p style='color:red;'>Node belum terhubung.</p>");
        return;
    }
    try {
        UniValue result = clientModel->node().executeRpc(
            "listassets", UniValue(UniValue::VARR), "");

        if (!result.isArray() || result.size() == 0) {
            infoBrowser->setHtml("<p style='color:#888; text-align:center; padding:20px;'>Belum ada stablecoin yang diterbitkan.</p>");
            return;
        }

        QString html =
            "<div style='font-family:sans-serif; font-size:12px;'>"
            "<table width='100%' style='border-collapse:collapse;'>"
            "<tr style='background:#8B0000; color:white;'>"
            "<th style='padding:7px 6px; text-align:left;'>Simbol</th>"
            "<th style='padding:7px 6px; text-align:left;'>Nama</th>"
            "<th style='padding:7px 6px; text-align:right;'>Supply</th>"
            "<th style='padding:7px 6px; text-align:left;'>Tipe</th>"
            "</tr>";

        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &a = result[i];
            QString sym    = QString::fromStdString(a["symbol"].get_str());
            QString name   = QString::fromStdString(a["name"].get_str());
            QString supply = QString::fromStdString(a["total_supply"].getValStr());
            QString type   = a.exists("type") ? QString::fromStdString(a["type"].get_str()) : "stablecoin";
            QString rowBg  = (i % 2 == 0) ? "#fff" : "#f9f9f9";

            QString badge;
            if (type == "stablecoin_pegged") {
                badge = "<span style='background:#E3F2FD; color:#1565C0; padding:2px 6px; border-radius:10px; font-size:10px;'>Oracle</span>";
            } else if (type == "stablecoin") {
                badge = "<span style='background:#E8F5E9; color:#2E7D32; padding:2px 6px; border-radius:10px; font-size:10px;'>Orderbook</span>";
            } else {
                badge = "<span style='background:#FFF3E0; color:#E65100; padding:2px 6px; border-radius:10px; font-size:10px;'>" + type + "</span>";
            }

            html += QString(
                "<tr style='background:%1;'>"
                "<td style='padding:6px; font-weight:bold; color:#8B0000;'>%2</td>"
                "<td style='padding:6px;'>%3</td>"
                "<td style='padding:6px; text-align:right; font-family:monospace;'>%4</td>"
                "<td style='padding:6px;'>%5</td>"
                "</tr>")
            .arg(rowBg, sym, name, supply, badge);
        }
        html += "</table></div>";
        infoBrowser->setHtml(html);

    } catch (...) {
        infoBrowser->setHtml("<p style='color:#888;'>Data stablecoin tidak tersedia.</p>");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// IPFS LOGO UPLOAD via Pinata
// ══════════════════════════════════════════════════════════════════════════════
static const QString PINATA_JWT_MB =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIxYTgxMjYxNi0zYTZiLTQ3ZDYtOGY0Ni1lM2Y1ZjY0MjUwNDEiLCJlbW"
    "FpbCI6InJlbnpvZ2FraUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdp"
    "b25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb2"
    "5Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJB"
    "Q1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiZWM5ZThjNzczZj"
    "Q3NDZjNzE1MWUiLCJzY29wZWRLZXlTZWNyZXQiOiIyMTY5YjQzMGEzNTUxMzg4YTM0OTE0NTM0MjcwMmY0MzZhMGU1"
    "YTdjYzk3NDk5MTZlOTA1OGFlMTI2OTYxZTNlIiwiZXhwIjoxODA2OTA1Mzg0fQ."
    "FxehvvdBTNk2g7EYAZ0lW9sqJjNyj752eFa5ThDns70";

void MintBurnPage::uploadLogoToPinata(const QString &filePath)
{
    QFile *file = new QFile(filePath);
    if (!file->open(QIODevice::ReadOnly)) {
        delete file;
        QMessageBox::warning(this, tr("Upload Gagal"),
            tr("Tidak dapat membuka file:\n%1").arg(filePath));
        return;
    }

    logoUploadBtn->setEnabled(false);
    logoUploadBtn->setText(tr("Mengupload..."));
    logoCidEdit->setPlaceholderText(tr("Mengupload ke IPFS via Pinata..."));

    QHttpMultiPart *multiPart = new QHttpMultiPart(QHttpMultiPart::FormDataType);
    QHttpPart filePart;
    filePart.setHeader(QNetworkRequest::ContentDispositionHeader,
        QString("form-data; name=\"file\"; filename=\"%1\"")
        .arg(QFileInfo(filePath).fileName()));
    filePart.setBodyDevice(file);
    file->setParent(multiPart);
    multiPart->append(filePart);

    QNetworkRequest req(QUrl("https://api.pinata.cloud/pinning/pinFileToIPFS"));
    req.setRawHeader("Authorization",
        QString("Bearer %1").arg(PINATA_JWT_MB).toUtf8());

    QNetworkReply *reply = m_nam->post(req, multiPart);
    multiPart->setParent(reply);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        logoUploadBtn->setEnabled(true);
        logoUploadBtn->setText(tr("Pilih Logo Stablecoin..."));

        if (reply->error() != QNetworkReply::NoError) {
            QMessageBox::warning(this, tr("Upload Gagal"),
                tr("Error upload ke Pinata:\n%1").arg(reply->errorString()));
            logoCidEdit->setPlaceholderText(tr("Upload gagal. Coba lagi."));
            return;
        }
        QByteArray data = reply->readAll();
        QJsonObject obj = QJsonDocument::fromJson(data).object();
        QString cid = obj["IpfsHash"].toString();
        if (cid.isEmpty()) {
            QMessageBox::warning(this, tr("Upload Gagal"),
                tr("Respons Pinata tidak valid:\n%1").arg(QString::fromUtf8(data)));
            return;
        }
        logoCidEdit->setText(cid);

        QNetworkRequest previewReq(
            QUrl(QString("https://gateway.pinata.cloud/ipfs/%1").arg(cid)));
        QNetworkReply *imgReply = m_nam->get(previewReq);
        connect(imgReply, &QNetworkReply::finished, this, [this, imgReply]() {
            imgReply->deleteLater();
            if (imgReply->error() == QNetworkReply::NoError) {
                QPixmap pix;
                if (pix.loadFromData(imgReply->readAll())) {
                    logoPreview->setPixmap(
                        pix.scaled(72, 72, Qt::KeepAspectRatio, Qt::SmoothTransformation));
                    logoPreview->setText("");
                }
            }
        });
    });
}

void MintBurnPage::onUploadStablecoinLogo()
{
    QString path = QFileDialog::getOpenFileName(this,
        tr("Pilih Logo Stablecoin"),
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
    QPixmap pix(path);
    if (!pix.isNull()) {
        logoPreview->setPixmap(
            pix.scaled(72, 72, Qt::KeepAspectRatio, Qt::SmoothTransformation));
        logoPreview->setText("");
    }
    uploadLogoToPinata(path);
}
