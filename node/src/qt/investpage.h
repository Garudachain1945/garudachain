// Copyright (c) 2026 GarudaChain developers
// Invest page — Public wallet mode (e-IPO, Portofolio, Swap/DEX)
#ifndef BITCOIN_QT_INVESTPAGE_H
#define BITCOIN_QT_INVESTPAGE_H

#include <QWidget>

class ClientModel;
class WalletModel;
class PlatformStyle;

QT_BEGIN_NAMESPACE
class QComboBox;
class QLabel;
class QLineEdit;
class QPushButton;
class QTabWidget;
class QTextBrowser;
QT_END_NAMESPACE

class InvestPage : public QWidget
{
    Q_OBJECT

public:
    explicit InvestPage(const PlatformStyle *platformStyle, QWidget *parent = nullptr);
    void setClientModel(ClientModel *clientModel);
    void setWalletModel(WalletModel *walletModel);

private Q_SLOTS:
    void onRefreshIPO();
    void onBuyToken();
    void onLoadAddresses();
    void onRefreshPortfolio();
    void onSwapPreview();
    void onSwapExecute();

private:
    ClientModel         *clientModel{nullptr};
    WalletModel         *walletModel{nullptr};
    const PlatformStyle *platformStyle;

    QTabWidget   *tabWidget;

    // ── Tab 0: e-IPO / Beli Saham ─────────────────────────────────────────
    QTextBrowser *ipoBrowser;
    QPushButton  *ipoRefreshBtn;
    QComboBox    *buyTokenCombo;      // symbol — asset_id
    QLineEdit    *buyAmountEdit;      // jumlah lembar
    QComboBox    *buyFromAddr;        // alamat pembeli (dari wallet)
    QPushButton  *loadAddrBtn;
    QPushButton  *buyBtn;
    QTextBrowser *buyStatusBrowser;

    // ── Tab 1: Portofolio ─────────────────────────────────────────────────
    QTextBrowser *portfolioBrowser;
    QPushButton  *portfolioRefreshBtn;

    // ── Tab 2: Swap / DEX ─────────────────────────────────────────────────
    QComboBox    *swapFromCombo;
    QLineEdit    *swapFromAmountEdit;
    QComboBox    *swapToCombo;
    QLabel       *swapRateLabel;
    QPushButton  *swapPreviewBtn;
    QPushButton  *swapExecBtn;
    QTextBrowser *swapStatusBrowser;

    void setupUI();
};

#endif // BITCOIN_QT_INVESTPAGE_H
