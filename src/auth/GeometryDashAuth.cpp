#include "GeometryDashAuth.hpp"

#include <argon/argon.hpp>

namespace cgdof::auth {

void startGeometryDashAuth(AuthCallback callback) {
    // Argon requires account data to be collected on the main thread.
    auto account = argon::getGameAccountData();

    // Keep only non-secret account metadata for the callback.
    // Do not expose AccountData itself: it also contains sensitive login data.
    const int accountId = account.accountId;
    const int userId = account.userId;
    auto username = account.username;

    async::spawn(
        argon::startAuth(std::move(account)),
        [accountId,
         userId,
         username = std::move(username),
         callback = std::move(callback)](geode::Result<std::string> result) mutable {
            // The token is passed to the caller for HTTPS exchange with our
            // Cloudflare Worker. Never log it or persist it in the mod.
            callback(
                accountId,
                userId,
                std::move(username),
                std::move(result)
            );
        }
    );
}

} // namespace cgdof::auth
