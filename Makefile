.PHONY: help up up-dev down logs ps backup restore list-backups reset clean

help:
	@printf "Common targets:\n"
	@printf "  make up            – build and start the full stack (detached)\n"
	@printf "  make up-dev        – start only the database (for split-mode dev)\n"
	@printf "  make down          – stop containers, KEEP data\n"
	@printf "  make logs          – tail backend logs\n"
	@printf "  make ps            – list container status\n"
	@printf "\n"
	@printf "Backups:\n"
	@printf "  make backup        – snapshot db + uploads into ./backups/<timestamp>/\n"
	@printf "  make list-backups  – list available backups\n"
	@printf "  make restore       – restore the most recent backup (interactive)\n"
	@printf "  make restore FILE=backups/2026-05-14_103000  – restore a specific one\n"
	@printf "  make reset         – take a backup, THEN wipe and rebuild (safe nuke)\n"
	@printf "\n"
	@printf "Danger zone:\n"
	@printf "  make clean         – like reset but does NOT back up first. Avoid.\n"

up:
	docker compose up --build -d
	docker compose ps

up-dev:
	docker compose up -d db

down:
	docker compose down

logs:
	docker compose logs -f backend

ps:
	docker compose ps

backup:
	@bash scripts/backup.sh

list-backups:
	@bash scripts/list-backups.sh

restore:
ifneq ($(strip $(FILE)),)
	@bash scripts/restore.sh "$(FILE)"
else
	@bash scripts/restore.sh
endif

reset:
	@bash scripts/safe-reset.sh

clean:
	@echo "⚠  this will DESTROY all data without backing up first."
	@read -r -p "Type 'destroy' to confirm: " ans && [ "$$ans" = "destroy" ] || { echo "aborted."; exit 1; }
	docker compose down -v --remove-orphans
