/**
 * Test Account Cleanup Client
 *
 * Helper to reset the test athlete account via API.
 * Works in browser consoles and Node-based test runners.
 */

class TestAthleteCleanup {
  constructor(adminToken, baseUrl) {
    this.adminToken = adminToken;
    this.baseUrl =
      baseUrl
      || (typeof window !== "undefined" && window.location && window.location.origin)
      || "http://localhost:8888";
  }

  /**
   * Trigger cleanup for a test athlete account.
   * @param {string} email
   * @returns {Promise<object>}
   */
  async cleanup(email = "rodrigolibanio1999@gmail.com") {
    const response = await fetch(
      `${this.baseUrl}/.netlify/functions/admin-cleanup-athlete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.adminToken}`
        },
        body: JSON.stringify({ email })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Cleanup failed with status ${response.status}`);
    }

    return response.json();
  }

  /**
   * Read endpoint metadata (no deletion).
   * @returns {Promise<object>}
   */
  async info() {
    const response = await fetch(
      `${this.baseUrl}/.netlify/functions/admin-cleanup-athlete`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.adminToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Info request failed with status ${response.status}`);
    }

    return response.json();
  }
}

/*
Browser usage example:

const token = localStorage.getItem("sb-admin-token");
const cleanup = new TestAthleteCleanup(token);
await cleanup.info();
await cleanup.cleanup("rodrigolibanio1999@gmail.com");
window.location.reload();
*/

/*
Node usage example:

const TestAthleteCleanup = require("./scripts/test-cleanup-client");
const cleanup = new TestAthleteCleanup(process.env.ADMIN_TOKEN, "https://lht.app");
await cleanup.cleanup("rodrigolibanio1999@gmail.com");
*/

if (typeof module !== "undefined" && module.exports) {
  module.exports = TestAthleteCleanup;
}
