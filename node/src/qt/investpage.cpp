// Copyright (c) 2026 GarudaChain developers
// Invest page — Public wallet mode (e-IPO, Portofolio, Swap/DEX)
#include <qt/investpage.h>
#include <qt/clientmodel.h>
#include <qt/walletmodel.h>
#include <qt/platformstyle.h>
#include <interfaces/node.h>
#include <univalue.h>

#include <QComboBox>
#include <QFormLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QPushButton>
#include <QTabWidget>
#include <QTextBrowser>
#include <QVBoxLayout>

InvestPage::InvestPage(const PlatformStyle *_platformStyle, QWidget *parent)
    : QWidget(parent), platformStyle(_platformStyle)
{
    setupUI();
}

void InvestPage::setClientModel(ClientModel *m) { clientModel = m; }
void InvestPage::setWalletModel(WalletModel *m) { walletModel = m; }

void InvestPage::setupUI()
{
    QVBoxLayout *root = new QVBoxLayout(this);
    root->setContentsMargins(6, 6, 6, 6);

    QLabel *header = new QLabel(
        "<h2 style='color:#1A237E; margin:0;'>GarudaChain Investor Dashboard</h2>"
        "<p style='color:#666; font-size:12px; margin:2px 0 6px;'>Beli saham via e-IPO, kelola portofolio, dan swap token di GarudaDEX.</p>");
    header->setWordWrap(true);
    root->addWidget(header);

    tabWidget = new QTabWidget(this);
    tabWidget->setUsesScrollButtons(false);
    tabWidget->setStyleSheet(
        "QTabBar::tab { padding: 7px 16px; font-weight: bold; min-width: 130px; }"
        "QTabBar::tab:selected { color: #1A237E; border-bottom: 2px solid #1A237E; }");

    // ══ TAB 0: e-IPO / Beli Saham ═════════════════════════════════════════
    QWidget *ipoTab = new QWidget();
    QVBoxLayout *ipoL = new QVBoxLayout(ipoTab);

    QLabel *ipoHdr = new QLabel(
        "<h3 style='color:#1A237E; margin:0;'>Penawaran Saham Aktif (e-IPO)</h3>"
        "<p style='color:#666; font-size:12px;'>Daftar presale token saham yang sedang terbuka. Beli sekarang sebelum listing di DEX.</p>");
    ipoHdr->setWordWrap(true);
    ipoL->addWidget(ipoHdr);

    ipoRefreshBtn = new QPushButton(tr("Refresh Daftar e-IPO"));
    ipoRefreshBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; "
        "padding:6px 14px; border-radius:4px; }");
    ipoL->addWidget(ipoRefreshBtn);

    ipoBrowser = new QTextBrowser();
    ipoBrowser->setOpenExternalLinks(false);
    ipoBrowser->setMinimumHeight(160);
    ipoBrowser->setHtml(
        "<div style='text-align:center; padding:30px; color:#888; font-family:sans-serif;'>"
        "<p style='font-size:24px;'>📋</p>"
        "<p>Klik Refresh untuk memuat daftar e-IPO aktif.</p>"
        "</div>");
    ipoL->addWidget(ipoBrowser, 1);

    // Buy panel
    QGroupBox *buyGrp = new QGroupBox(tr("Beli Token Saham (e-IPO)"));
    buyGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#1A237E; border:2px solid #1A237E; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *buyF = new QFormLayout(buyGrp);

    buyTokenCombo = new QComboBox();
    buyTokenCombo->setEditable(false);
    buyTokenCombo->setPlaceholderText(tr("Pilih token saham dari daftar e-IPO"));
    buyF->addRow(tr("Token Saham:"), buyTokenCombo);

    buyAmountEdit = new QLineEdit();
    buyAmountEdit->setPlaceholderText("1000");
    buyF->addRow(tr("Jumlah Lembar:"), buyAmountEdit);

    QHBoxLayout *addrRow = new QHBoxLayout();
    buyFromAddr = new QComboBox();
    buyFromAddr->setEditable(true);
    buyFromAddr->setPlaceholderText(tr("Alamat pembeli (dari wallet)"));
    loadAddrBtn = new QPushButton(tr("Muat Alamat"));
    loadAddrBtn->setStyleSheet("QPushButton { padding:4px 8px; }");
    addrRow->addWidget(buyFromAddr, 1);
    addrRow->addWidget(loadAddrBtn);
    QWidget *addrW = new QWidget(); addrW->setLayout(addrRow);
    buyF->addRow(tr("Alamat Pembeli:"), addrW);

    buyBtn = new QPushButton(tr("Beli Token Saham"));
    buyBtn->setStyleSheet(
        "QPushButton { background:#1A237E; color:white; font-weight:bold; "
        "padding:8px 16px; border-radius:4px; }"
        "QPushButton:hover { background:#283593; }");
    buyF->addRow(buyBtn);
    ipoL->addWidget(buyGrp);

    buyStatusBrowser = new QTextBrowser();
    buyStatusBrowser->setMaximumHeight(70);
    buyStatusBrowser->setHtml("<p style='color:#888; font-size:12px;'>Status pembelian muncul di sini.</p>");
    ipoL->addWidget(buyStatusBrowser);

    tabWidget->addTab(ipoTab, tr("e-IPO / Beli Saham"));

    // ══ TAB 1: PORTOFOLIO ═════════════════════════════════════════════════
    QWidget *portTab = new QWidget();
    QVBoxLayout *portL = new QVBoxLayout(portTab);

    QLabel *portHdr = new QLabel(
        "<h3 style='color:#1A237E; margin:0;'>Portofolio Saya</h3>"
        "<p style='color:#666; font-size:12px;'>Semua aset token saham dan stablecoin yang Anda miliki di wallet ini.</p>");
    portHdr->setWordWrap(true);
    portL->addWidget(portHdr);

    portfolioRefreshBtn = new QPushButton(tr("Refresh Portofolio"));
    portfolioRefreshBtn->setStyleSheet(
        "QPushButton { background:#1565C0; color:white; font-weight:bold; "
        "padding:6px 14px; border-radius:4px; }");
    portL->addWidget(portfolioRefreshBtn);

    portfolioBrowser = new QTextBrowser();
    portfolioBrowser->setOpenExternalLinks(false);
    portfolioBrowser->setHtml(
        "<div style='text-align:center; padding:40px; color:#888; font-family:sans-serif;'>"
        "<p style='font-size:24px;'>💼</p>"
        "<p>Klik Refresh untuk memuat portofolio.</p>"
        "</div>");
    portL->addWidget(portfolioBrowser, 1);

    tabWidget->addTab(portTab, tr("Portofolio"));

    // ══ TAB 2: SWAP / DEX ═════════════════════════════════════════════════
    QWidget *swapTab = new QWidget();
    QVBoxLayout *swapL = new QVBoxLayout(swapTab);

    QLabel *swapHdr = new QLabel(
        "<h3 style='color:#1A237E; margin:0;'>GarudaDEX — Swap Token</h3>"
        "<p style='color:#666; font-size:12px;'>Tukar token saham atau stablecoin secara langsung melalui liquidity pool GarudaChain.</p>");
    swapHdr->setWordWrap(true);
    swapL->addWidget(swapHdr);

    QGroupBox *swapGrp = new QGroupBox(tr("Swap Token"));
    swapGrp->setStyleSheet(
        "QGroupBox { font-weight:bold; color:#1A237E; border:2px solid #1A237E; "
        "border-radius:6px; margin-top:6px; padding-top:8px; }");
    QFormLayout *swapF = new QFormLayout(swapGrp);

    swapFromCombo = new QComboBox();
    swapFromCombo->setPlaceholderText(tr("Token yang dijual"));
    swapF->addRow(tr("Dari Token:"), swapFromCombo);

    swapFromAmountEdit = new QLineEdit();
    swapFromAmountEdit->setPlaceholderText("1000");
    swapF->addRow(tr("Jumlah:"), swapFromAmountEdit);

    swapToCombo = new QComboBox();
    swapToCombo->setPlaceholderText(tr("Token yang dibeli"));
    swapF->addRow(tr("Ke Token:"), swapToCombo);

    swapRateLabel = new QLabel(
        "<span style='color:#888; font-size:12px;'>Klik Preview untuk melihat estimasi harga.</span>");
    swapRateLabel->setWordWrap(true);
    swapF->addRow(tr("Estimasi:"), swapRateLabel);

    QHBoxLayout *swapBtnRow = new QHBoxLayout();
    swapPreviewBtn = new QPushButton(tr("Preview Swap"));
    swapPreviewBtn->setStyleSheet(
        "QPushButton { background:#455A64; color:white; font-weight:bold; "
        "padding:7px 14px; border-radius:4px; }");
    swapExecBtn = new QPushButton(tr("Eksekusi Swap"));
    swapExecBtn->setStyleSheet(
        "QPushButton { background:#1A237E; color:white; font-weight:bold; "
        "padding:7px 14px; border-radius:4px; }"
        "QPushButton:hover { background:#283593; }");
    swapExecBtn->setEnabled(false);
    swapBtnRow->addWidget(swapPreviewBtn);
    swapBtnRow->addWidget(swapExecBtn, 1);

    QWidget *swapBtnW = new QWidget(); swapBtnW->setLayout(swapBtnRow);
    swapF->addRow(swapBtnW);
    swapL->addWidget(swapGrp);

    swapStatusBrowser = new QTextBrowser();
    swapStatusBrowser->setMaximumHeight(90);
    swapStatusBrowser->setHtml("<p style='color:#888; font-size:12px;'>Status swap muncul di sini.</p>");
    swapL->addWidget(swapStatusBrowser);
    swapL->addStretch();

    tabWidget->addTab(swapTab, tr("Swap / DEX"));

    root->addWidget(tabWidget);

    // ── Connections ────────────────────────────────────────────────────────
    connect(ipoRefreshBtn,        &QPushButton::clicked, this, &InvestPage::onRefreshIPO);
    connect(loadAddrBtn,          &QPushButton::clicked, this, &InvestPage::onLoadAddresses);
    connect(buyBtn,               &QPushButton::clicked, this, &InvestPage::onBuyToken);
    connect(portfolioRefreshBtn,  &QPushButton::clicked, this, &InvestPage::onRefreshPortfolio);
    connect(swapPreviewBtn,       &QPushButton::clicked, this, &InvestPage::onSwapPreview);
    connect(swapExecBtn,          &QPushButton::clicked, this, &InvestPage::onSwapExecute);
}

// ══════════════════════════════════════════════════════════════════════════════
// REFRESH e-IPO LIST
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onRefreshIPO()
{
    if (!clientModel) {
        ipoBrowser->setHtml("<p style='color:red;'>Node belum terhubung.</p>");
        return;
    }
    try {
        UniValue result = clientModel->node().executeRpc(
            "listpresales", UniValue(UniValue::VARR), "");

        buyTokenCombo->clear();
        swapFromCombo->clear();
        swapToCombo->clear();
        swapFromCombo->addItem("GRD");
        swapToCombo->addItem("GRD");

        if (!result.isArray() || result.size() == 0) {
            ipoBrowser->setHtml(
                "<div style='text-align:center; padding:40px; color:#888; font-family:sans-serif;'>"
                "<p style='font-size:28px;'>📋</p>"
                "<p>Belum ada penawaran saham (e-IPO) aktif saat ini.</p>"
                "<p style='font-size:11px;'>Pantau terus — perusahaan baru segera hadir!</p>"
                "</div>");
            return;
        }

        QString html = "<div style='font-family:sans-serif; font-size:12px;'>";

        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &p = result[i];
            QString sym     = QString::fromStdString(p["symbol"].get_str());
            QString name    = p.exists("name")   ? QString::fromStdString(p["name"].get_str())   : sym;
            QString assetId = p.exists("asset_id") ? QString::fromStdString(p["asset_id"].get_str()) : "";
            QString status  = QString::fromStdString(p["status"].get_str());
            double  sold    = p["tokens_sold"].get_real();
            double  total   = p["tokens_for_sale"].get_real();
            double  pct     = total > 0 ? sold / total * 100.0 : 0.0;
            double  price   = p["price_grd"].get_real();
            double  raised  = p["grd_raised"].get_real();
            bool    isOpen  = (status == "OPEN");

            QString bg   = isOpen ? "#E8F5E9" : "#f5f5f5";
            QString scol = isOpen ? "#2E7D32" : "#666";
            QString pctBar = QString::number(qMin(pct, 100.0), 'f', 0);

            html += QString(
                "<div style='border:1px solid #ddd; border-radius:8px; padding:12px; "
                "margin-bottom:8px; background:%1;'>"
                "<div style='display:flex; justify-content:space-between; align-items:center;'>"
                "<span><b style='font-size:16px; color:#1A237E;'>%2</b> "
                "<span style='color:#555; font-size:12px;'>%3</span></span>"
                "<span style='color:%4; font-weight:bold;'>● %5</span></div>"
                "<div style='background:#ddd; border-radius:4px; height:7px; margin:8px 0;'>"
                "<div style='background:#4CAF50; width:%6%%; height:7px; border-radius:4px;'></div></div>"
                "<table width='100%%' style='font-size:12px;'><tr>"
                "<td><small style='color:#666;'>Terjual</small><br><b>%7%%</b></td>"
                "<td><small style='color:#666;'>Harga IPO</small><br><b>%8 GRD/lembar</b></td>"
                "<td><small style='color:#666;'>Dana Terhimpun</small><br><b style='color:#8B0000;'>%9 GRD</b></td>"
                "<td><small style='color:#666;'>Sisa Token</small><br><b>%10 lembar</b></td>"
                "</tr></table></div>")
            .arg(bg, sym, name, scol, status)
            .arg(pctBar)
            .arg(QString::number(pct, 'f', 1))
            .arg(QString::number(price, 'f', 4))
            .arg(QString::number(raised, 'f', 2))
            .arg(QString::number(total - sold, 'f', 0));

            if (isOpen) {
                QString label = assetId.isEmpty()
                    ? sym
                    : QString("%1 — %2").arg(sym, assetId.left(16) + "...");
                buyTokenCombo->addItem(label, assetId.isEmpty() ? sym : assetId);
            }
            swapFromCombo->addItem(sym);
            swapToCombo->addItem(sym);
        }
        html += "</div>";
        ipoBrowser->setHtml(html);

    } catch (...) {
        ipoBrowser->setHtml("<p style='color:#888;'>Data e-IPO tidak tersedia.</p>");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD WALLET ADDRESSES
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onLoadAddresses()
{
    if (!clientModel) return;
    try {
        UniValue result = clientModel->node().executeRpc(
            "listaddressgroupings", UniValue(UniValue::VARR), "");
        buyFromAddr->clear();
        if (result.isArray()) {
            for (size_t g = 0; g < result.size(); ++g) {
                const UniValue &grp = result[g];
                if (grp.isArray()) {
                    for (size_t j = 0; j < grp.size(); ++j) {
                        const UniValue &e = grp[j];
                        if (e.isArray() && e.size() >= 1)
                            buyFromAddr->addItem(QString::fromStdString(e[0].get_str()));
                    }
                }
            }
        }
        if (buyFromAddr->count() == 0) {
            UniValue r2 = clientModel->node().executeRpc(
                "getnewaddress", UniValue(UniValue::VARR), "");
            buyFromAddr->addItem(QString::fromStdString(r2.get_str()));
        }
    } catch (...) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// BUY TOKEN (e-IPO)
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onBuyToken()
{
    QString assetId = buyTokenCombo->currentData().toString();
    if (assetId.isEmpty()) assetId = buyTokenCombo->currentText().trimmed();
    QString amount  = buyAmountEdit->text().trimmed();
    QString addr    = buyFromAddr->currentText().trimmed();

    if (assetId.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih token saham yang ingin dibeli.")); return;
    }
    if (amount.toLongLong() <= 0) {
        QMessageBox::warning(this, tr("Error"), tr("Jumlah lembar harus lebih dari 0.")); return;
    }
    if (addr.isEmpty()) {
        QMessageBox::warning(this, tr("Error"), tr("Pilih alamat wallet pembeli.")); return;
    }
    if (!clientModel) {
        QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return;
    }

    auto reply = QMessageBox::question(this, tr("Konfirmasi Beli Saham"),
        tr("Beli <b>%1 lembar</b> token saham <b>%2</b>\ndari alamat <b>%3</b>?\n\nPembayaran otomatis dipotong dari saldo GRD Anda.")
        .arg(amount, buyTokenCombo->currentText(), addr.left(24) + "..."),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    try {
        // RPC: buytoken <asset_id_or_symbol> <amount> <buyer_address>
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(assetId.toStdString()));
        params.push_back(UniValue(amount.toLongLong()));
        params.push_back(UniValue(addr.toStdString()));

        UniValue result = clientModel->node().executeRpc("buytoken", params, "");
        QString txid = QString::fromStdString(result.get_str());

        buyStatusBrowser->setHtml(QString(
            "<div style='background:#E8F5E9; border:2px solid #4CAF50; border-radius:6px; padding:10px;'>"
            "<b style='color:#2E7D32;'>✅ PEMBELIAN BERHASIL!</b><br>"
            "<small>TXID: <code>%1</code></small><br>"
            "<small><b>%2 lembar</b> saham berhasil dibeli. Mine 1 blok untuk konfirmasi.</small>"
            "</div>").arg(txid, amount));

    } catch (const std::exception &e) {
        buyStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #C62828; border-radius:6px; padding:10px;'>"
            "<b style='color:#C62828;'>✗ Error:</b> %1</div>")
            .arg(QString::fromStdString(e.what())));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// REFRESH PORTFOLIO
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onRefreshPortfolio()
{
    if (!clientModel) {
        portfolioBrowser->setHtml("<p style='color:red;'>Node belum terhubung.</p>");
        return;
    }
    try {
        UniValue result = clientModel->node().executeRpc(
            "getwalletassets", UniValue(UniValue::VARR), "");

        if (!result.isArray() || result.size() == 0) {
            portfolioBrowser->setHtml(
                "<div style='text-align:center; padding:40px; color:#888; font-family:sans-serif;'>"
                "<p style='font-size:28px;'>💼</p>"
                "<p>Portofolio kosong. Beli saham via tab e-IPO / Beli Saham.</p>"
                "</div>");
            return;
        }

        double totalGrd = 0.0;
        QString rows;

        for (size_t i = 0; i < result.size(); ++i) {
            const UniValue &a = result[i];
            QString sym    = QString::fromStdString(a["symbol"].get_str());
            QString name   = a.exists("name") ? QString::fromStdString(a["name"].get_str()) : sym;
            double  bal    = a["balance"].get_real();
            double  price  = a.exists("price_grd") ? a["price_grd"].get_real() : 0.0;
            double  valGrd = bal * price;
            totalGrd      += valGrd;
            QString type   = a.exists("type") ? QString::fromStdString(a["type"].get_str()) : "asset";
            QString badgeBg = (type == "saham") ? "#E3F2FD" : "#E8F5E9";
            QString badgeFg = (type == "saham") ? "#1565C0" : "#2E7D32";
            QString rowBg   = (i % 2 == 0) ? "#fff" : "#f9f9f9";

            rows += QString(
                "<tr style='background:%1;'>"
                "<td style='padding:7px 6px; font-weight:bold;'>%2</td>"
                "<td style='padding:7px 6px; color:#555;'>%3</td>"
                "<td style='padding:7px 6px; text-align:right; font-family:monospace;'>%4</td>"
                "<td style='padding:7px 6px; text-align:right; color:#1A237E; font-family:monospace;'>%5 GRD</td>"
                "<td style='padding:7px 6px;'>"
                "<span style='background:%6; color:%7; padding:2px 7px; border-radius:10px; font-size:10px;'>%8</span>"
                "</td></tr>")
            .arg(rowBg, sym, name)
            .arg(QString::number(bal, 'f', 0))
            .arg(QString::number(valGrd, 'f', 2))
            .arg(badgeBg, badgeFg, type);
        }

        QString html = QString(
            "<div style='font-family:sans-serif; font-size:12px;'>"
            "<div style='background:#1A237E; color:white; border-radius:6px; padding:12px; margin-bottom:10px;'>"
            "<b>Total Nilai Portofolio:</b> <span style='font-size:16px;'>%1 GRD</span>"
            "</div>"
            "<table width='100%' style='border-collapse:collapse;'>"
            "<tr style='background:#1A237E; color:white;'>"
            "<th style='padding:7px 6px; text-align:left;'>Simbol</th>"
            "<th style='padding:7px 6px; text-align:left;'>Nama</th>"
            "<th style='padding:7px 6px; text-align:right;'>Saldo</th>"
            "<th style='padding:7px 6px; text-align:right;'>Nilai (GRD)</th>"
            "<th style='padding:7px 6px; text-align:left;'>Tipe</th>"
            "</tr>%2</table></div>")
        .arg(QString::number(totalGrd, 'f', 2), rows);

        portfolioBrowser->setHtml(html);

    } catch (...) {
        portfolioBrowser->setHtml("<p style='color:#888;'>Data portofolio tidak tersedia.</p>");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SWAP PREVIEW
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onSwapPreview()
{
    QString fromToken  = swapFromCombo->currentText().trimmed();
    QString toToken    = swapToCombo->currentText().trimmed();
    QString amountStr  = swapFromAmountEdit->text().trimmed();
    double  amount     = amountStr.toDouble();

    if (fromToken.isEmpty() || toToken.isEmpty() || amount <= 0) {
        QMessageBox::warning(this, tr("Error"),
            tr("Isi semua field swap dan pastikan jumlah lebih dari 0."));
        return;
    }
    if (fromToken == toToken) {
        QMessageBox::warning(this, tr("Error"), tr("Token asal dan tujuan tidak boleh sama."));
        return;
    }
    if (!clientModel) {
        QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung."));
        return;
    }

    try {
        // RPC: getswapquote <from_token> <to_token> <amount>
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(fromToken.toStdString()));
        params.push_back(UniValue(toToken.toStdString()));
        params.push_back(UniValue(amount));

        UniValue result = clientModel->node().executeRpc("getswapquote", params, "");
        double outAmount = result["output_amount"].get_real();
        double rate      = result.exists("rate")     ? result["rate"].get_real()     : (outAmount / amount);
        double fee       = result.exists("fee_pct")  ? result["fee_pct"].get_real()  : 0.3;

        swapRateLabel->setText(QString(
            "<span style='color:#1A237E; font-size:13px;'>"
            "<b>%1 %2 → %3 %4</b></span><br>"
            "<small style='color:#555;'>Rate: 1 %5 = %6 %7 &nbsp;|&nbsp; Fee: %8%%</small>")
        .arg(amountStr, fromToken)
        .arg(QString::number(outAmount, 'f', 4), toToken)
        .arg(fromToken).arg(QString::number(rate, 'f', 6), toToken)
        .arg(QString::number(fee, 'f', 2)));

        swapStatusBrowser->setHtml(QString(
            "<div style='background:#E3F2FD; border:2px solid #1565C0; border-radius:6px; padding:10px;'>"
            "<b style='color:#1A237E;'>📊 PREVIEW SWAP</b><br>"
            "<small>%1 %2 → <b>%3 %4</b> (rate: %5) &nbsp;•&nbsp; Fee: %6%%</small>"
            "</div>")
        .arg(amountStr, fromToken)
        .arg(QString::number(outAmount, 'f', 4), toToken)
        .arg(QString::number(rate, 'f', 6))
        .arg(QString::number(fee, 'f', 2)));

        swapExecBtn->setEnabled(true);

    } catch (const std::exception &e) {
        swapStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #C62828; border-radius:6px; padding:10px;'>"
            "<b style='color:#C62828;'>✗ Error:</b> %1</div>")
            .arg(QString::fromStdString(e.what())));
        swapExecBtn->setEnabled(false);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SWAP EXECUTE
// ══════════════════════════════════════════════════════════════════════════════
void InvestPage::onSwapExecute()
{
    QString fromToken = swapFromCombo->currentText().trimmed();
    QString toToken   = swapToCombo->currentText().trimmed();
    QString amountStr = swapFromAmountEdit->text().trimmed();
    double  amount    = amountStr.toDouble();

    if (fromToken.isEmpty() || toToken.isEmpty() || amount <= 0) return;

    auto reply = QMessageBox::question(this, tr("Konfirmasi Swap"),
        tr("Swap <b>%1 %2</b> ke <b>%3</b>?\n\nAksi ini tidak dapat dibatalkan.")
        .arg(amountStr, fromToken, toToken),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
    if (reply != QMessageBox::Yes) return;

    if (!clientModel) {
        QMessageBox::warning(this, tr("Error"), tr("Node belum terhubung.")); return;
    }

    try {
        // RPC: swaptokens <from_token> <to_token> <amount>
        UniValue params(UniValue::VARR);
        params.push_back(UniValue(fromToken.toStdString()));
        params.push_back(UniValue(toToken.toStdString()));
        params.push_back(UniValue(amount));

        UniValue result = clientModel->node().executeRpc("swaptokens", params, "");
        QString txid = QString::fromStdString(result.get_str());

        swapStatusBrowser->setHtml(QString(
            "<div style='background:#E8F5E9; border:2px solid #4CAF50; border-radius:6px; padding:10px;'>"
            "<b style='color:#2E7D32;'>✅ SWAP BERHASIL!</b><br>"
            "<small>TXID: <code>%1</code></small><br>"
            "<small>%2 %3 berhasil ditukar ke %4. Mine 1 blok untuk konfirmasi.</small>"
            "</div>").arg(txid, amountStr, fromToken, toToken));

        swapExecBtn->setEnabled(false);

    } catch (const std::exception &e) {
        swapStatusBrowser->setHtml(QString(
            "<div style='background:#FFEBEE; border:2px solid #C62828; border-radius:6px; padding:10px;'>"
            "<b style='color:#C62828;'>✗ Error:</b> %1</div>")
            .arg(QString::fromStdString(e.what())));
    }
}
