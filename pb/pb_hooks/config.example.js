module.exports = {
    INITIAL_FREE_SPOTS: () => 5,
    PAYWAY_MERCHANT_ID: () => "ec461667",
    PAYWAY_KEY: () => "73f78ce22bf795c19e7abb42cf2a2b3929ef77b0",
    FRONTEND_ENDPOINT: () => "https://test.popok.uk" ,
    SHEET_SERVER_ENDPOINT: () => "http://127.0.0.1:3000",
    PAYWAY_ENDPOINT: () => "https://checkout-sandbox.payway.com.kh",
    get_license_price: (test_group) => 1,
    get_live_mode_price: (test_group) => 10
}