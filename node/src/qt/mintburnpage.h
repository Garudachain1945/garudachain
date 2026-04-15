// Copyright (c) 2026 GarudaChain developers
// Mint/Burn page for CBDC wallet mode (native GRD + stablecoin)
#ifndef BITCOIN_QT_MINTBURNPAGE_H
#define BITCOIN_QT_MINTBURNPAGE_H

#include <QWidget>

class ClientModel;
class WalletModel;
class PlatformStyle;

QT_BEGIN_NAMESPACE
class QComboBox;
class QLabel;
class QLineEdit;
class QNetworkAccessManager;
class QNetworkReply;
class QPushButton;
class QTextBrowser;
class QTabWidget;
class QSpinBox;
QT_END_NAMESPACE

class MintBurnPage : public QWidget
{
    Q_OBJECT

public:
    explicit MintBurnPage(const PlatformStyle *platformStyle, QWidget *parent = nullptr);
    void setClientModel(ClientModel *clientModel);
    void setWalletModel(WalletModel *walletModel);

private Q_SLOTS:
    void onLoadWalletAddresses();
    void onMintGRD();
    void onBurnGRD();
    void onIssueOrderbook();
    void onMintOrderbook();
    void onBurnOrderbook();
    void onIssueOracle();
    void onMintOracle();
    void onBurnOracle();
    void onRefreshList();
    void onUploadStablecoinLogo();

private:
    ClientModel  *clientModel{nullptr};
    WalletModel  *walletModel{nullptr};
    const PlatformStyle *platformStyle;

    QTabWidget   *tabWidget;

    // Tab 0: Mint/Burn GRD native
    QLineEdit    *mintGRDAmountEdit;
    QLineEdit    *mintGRDPrivKeyEdit;
    QPushButton  *mintGRDBtn;
    QLineEdit    *burnGRDAmountEdit;
    QLineEdit    *burnGRDPrivKeyEdit;
    QPushButton  *burnGRDBtn;
    QTextBrowser *grdStatusBrowser;

    // Tab 1: Stablecoin Orderbook
    QLineEdit    *obSymbolEdit;
    QLineEdit    *obNameEdit;
    QLineEdit    *obSupplyEdit;
    QPushButton  *obIssueBtn;
    QLabel       *obLogoPreview;
    QPushButton  *obLogoUploadBtn;
    QLineEdit    *obLogoCidEdit;
    QComboBox    *obMintCombo;
    QLineEdit    *obMintAmountEdit;
    QPushButton  *obMintBtn;
    QComboBox    *obBurnCombo;
    QLineEdit    *obBurnAmountEdit;
    QPushButton  *obBurnBtn;

    // Tab 2: Stablecoin Oracle
    QLineEdit    *orSymbolEdit;
    QLineEdit    *orNameEdit;
    QLineEdit    *orPegCurrencyEdit;
    QLineEdit    *orSupplyEdit;
    QPushButton  *orIssueBtn;
    QComboBox    *orMintCombo;
    QLineEdit    *orMintAmountEdit;
    QPushButton  *orMintBtn;
    QComboBox    *orBurnCombo;
    QLineEdit    *orBurnAmountEdit;
    QPushButton  *orBurnBtn;

    // Tab 3: Stablecoin list
    QTextBrowser *infoBrowser;
    QPushButton  *refreshBtn;

    // Logo upload
    QLabel       *logoPreview;
    QPushButton  *logoUploadBtn;
    QLineEdit    *logoCidEdit;
    QNetworkAccessManager *m_nam{nullptr};

    void setupUI();
    void loadWalletAddresses(QComboBox *combo);
    void loadAssetCombo(QComboBox *combo, const QString &filterType);
    void uploadLogoToPinata(const QString &filePath);
    void issueStablecoin(const QString &symbol, const QString &name, const QString &type,
                         const QString &supply, const QString &pegCurrency);
    void doMint(QComboBox *combo, QLineEdit *amountEdit);
    void doBurn(QComboBox *combo, QLineEdit *amountEdit);
};

#endif // BITCOIN_QT_MINTBURNPAGE_H
