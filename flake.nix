{
  description = "NeRugaysyaBot — Telegram bot that detects bad words";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_20;
        in
        {
          default = pkgs.buildNpmPackage {
            pname = "ne-rugaysya-bot";
            version = "1.0.0";
            src = ./.;

            # Run `nix build` once — it will fail and print the correct hash.
            # Replace this value with the hash from the error message.
            npmDepsHash = "sha256-wm4mTJJEFZbqQvHv3UtJehTfTqXC+G4GBBoG3222LW4=";
            inherit nodejs;
            dontNpmBuild = true;

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/ne-rugaysya-bot
              cp -r node_modules $out/lib/ne-rugaysya-bot/
              cp bot.js package.json bad_words.txt $out/lib/ne-rugaysya-bot/

              makeWrapper ${nodejs}/bin/node $out/bin/ne-rugaysya-bot \
                --add-flags "$out/lib/ne-rugaysya-bot/bot.js"

              runHook postInstall
            '';

            nativeBuildInputs = [ pkgs.makeWrapper ];
          };
        });

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.ne-rugaysya-bot;
        in
        {
          options.services.ne-rugaysya-bot = {
            enable = lib.mkEnableOption "NeRugaysyaBot Telegram bot";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The ne-rugaysya-bot package to use.";
            };

            stateDir = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/ne-rugaysya-bot";
              description = "Directory for mutable state (bad_words.txt, .env).";
            };

            tokenFile = lib.mkOption {
              type = lib.types.str;
              description = ''
                Path to a file containing the Telegram bot token.
                The file should contain just the token string, nothing else.
                Use this instead of putting the token directly in the Nix config
                to keep secrets out of the Nix store.
              '';
              example = "/run/secrets/ne-rugaysya-bot-token";
            };

            chatId = lib.mkOption {
              type = lib.types.nullOr lib.types.int;
              default = null;
              description = "Telegram chat ID to monitor. null = all chats.";
            };

            userIds = lib.mkOption {
              type = lib.types.listOf lib.types.int;
              default = [ ];
              description = "User IDs to watch. Empty = watch everyone.";
            };

            adminIds = lib.mkOption {
              type = lib.types.listOf lib.types.int;
              default = [ ];
              description = "User IDs that can use admin commands.";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.ne-rugaysya-bot = {
              description = "NeRugaysyaBot Telegram bot";
              wantedBy = [ "multi-user.target" ];
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];

              serviceConfig = {
                Type = "simple";
                DynamicUser = true;
                StateDirectory = "ne-rugaysya-bot";
                WorkingDirectory = cfg.stateDir;
                Restart = "on-failure";
                RestartSec = 5;

                # hardening
                NoNewPrivileges = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                ReadWritePaths = [ cfg.stateDir ];
                PrivateTmp = true;
              };

              script = ''
                export TELEGRAM_BOT_TOKEN="$(cat ${cfg.tokenFile})"
                export STATE_DIR="${cfg.stateDir}"
                ${lib.optionalString (cfg.chatId != null) ''export CHAT_ID="${toString cfg.chatId}"''}
                ${lib.optionalString (cfg.userIds != [ ]) ''export USER_IDS="${lib.concatMapStringsSep "," toString cfg.userIds}"''}
                ${lib.optionalString (cfg.adminIds != [ ]) ''export ADMIN_IDS="${lib.concatMapStringsSep "," toString cfg.adminIds}"''}
                exec ${cfg.package}/bin/ne-rugaysya-bot
              '';
            };
          };
        };
    };
}
