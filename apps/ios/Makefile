# iOS 命令（apps/ios/AGENTS.md）。工具版本由仓库根的 .mise.toml 固定。
MISE ?= mise exec --
SIMULATOR ?= iPhone 18 Pro
DESTINATION ?= platform=iOS Simulator,name=$(SIMULATOR)
DERIVED ?= .build/DerivedData
XCODEBUILD = xcodebuild -project PostReader.xcodeproj -scheme PostReader -destination '$(DESTINATION)' \
	-derivedDataPath $(DERIVED) -skipPackagePluginValidation CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual

.PHONY: vendor project lint format build test clean

vendor:
	./Vendor/fetch-grdb.sh

project: vendor
	$(MISE) xcodegen generate --spec project.yml

lint:
	$(MISE) swiftlint lint --strict --quiet
	$(MISE) swiftformat --lint .

format:
	$(MISE) swiftformat .

build: project
	$(XCODEBUILD) build

test: project
	$(XCODEBUILD) test

clean:
	rm -rf PostReader.xcodeproj $(DERIVED)
