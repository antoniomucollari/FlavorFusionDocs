## TABLE OF CONTENTS
1. [Abstract](#abstract)
2. [Introduction: The Shift to Cloud Security](#introduction)
3. [Project Scenario: The FoodApp Platform](#project-scenario)
4. [Threat Modeling and Vulnerability Analysis](#threat-modeling)
5. [Implementation Phase 1: Secrets Management & Azure Key Vault](#phase-1)
6. [Implementation Phase 2: Network Isolation & Database Security](#phase-2)
7. [Implementation Phase 3: Edge Protection & Web Application Firewall (WAF)](#phase-3)
8. [Conclusion](#conclusion)

---

## 1. Abstract <a name="abstract"></a>
As modern software development shifts increasingly towards cloud-native deployments, perimeter-based security models are no longer sufficient. This project demonstrates the practical application of cloud security principles, specifically focusing on a Zero-Trust architecture within Microsoft Azure. By taking a vulnerable, locally-configured Spring Boot application ("FoodApp") and migrating it to a hardened cloud environment, this report details the implementation of enterprise-grade security controls. Key focus areas include cryptographic secrets management, network isolation, identity-based access control, and edge-level threat mitigation.

## 2. Introduction: The Shift to Cloud Security <a name="introduction"></a>
In traditional data centers, security heavily relied on the "castle-and-moat" methodology—trusting everything inside the corporate network and blocking external threats at the perimeter firewall. However, the Cloud Shared Responsibility Model dictates that while the cloud provider (Azure) secures the physical infrastructure, the customer (the developer/engineer) is responsible for securing the application, data, identity, and network configurations.

In this project, we apply the **Zero-Trust Model**, which operates on the principle of "Never trust, always verify." Every request, whether it originates from the public internet or from within the internal Azure Virtual Network (VNet), must be authenticated, authorized, and encrypted.

## 3. Project Scenario: The "FoodApp" Platform <a name="project-scenario"></a>
The application used for this security implementation is a Java Spring Boot backend for a food delivery platform.

Initially, the application was configured for local development, which introduced severe security anti-patterns. Hardcoded credentials, plain-text database passwords, unprotected API keys (AWS S3), and raw JWT signing secrets were all stored in the `application.properties` file.

*If this code had been deployed to production or pushed to a public repository, it would have resulted in immediate data breaches and unauthorized access to cloud resources.*

**Goal:** Refactor the architecture and deploy it to Azure, applying Security Engineering principles to lock down the application layer, the network layer, and the data layer.

*(Placeholder for Architecture)*
> **[📸 INSERT IMAGE HERE: A diagram of your Azure Architecture (You can draw a simple diagram showing the App Service, Key Vault, VNet, Database, and WAF)]**

---

## 4. Threat Modeling and Vulnerability Analysis <a name="threat-modeling"></a>
Before implementing cloud defenses, a threat model was established based on the initial codebase. The following vulnerabilities were identified:

1.  **Credential Exposure (CWE-798):** Passwords for the PostgreSQL database and the SMTP mail server were stored in plain text.
2.  **Insecure Key Storage (CWE-320):** The `secreteJwtString` and AWS S3 API keys were easily accessible to anyone with access to the source code.
3.  **Network Exposure:** The database was configured to be publicly accessible rather than restricted to internal traffic.
4.  **Lack of Application Layer Defense:** The Spring Boot API was exposed directly to the internet without a Web Application Firewall (WAF) to filter malicious payloads (e.g., SQL Injection, Cross-Site Scripting).

---

## 5. Implementation Phase 1: Secrets Management & Azure Key Vault <a name="phase-1"></a>
The first principle of cloud security engineering is removing secrets from source code. To achieve this, **Azure Key Vault** was utilized. Key Vault is a cloud service for securely storing and accessing secrets, API keys, and certificates.

Instead of keeping sensitive data in the `application.properties` file, the following variables were migrated to Azure Key Vault:
* `spring.datasource.password`
* `secreteJwtString`
* `spring.mail.password`
* `aws.accessKeyId` and `aws.secretKey`

**Mechanism:** The Azure App Service hosting the Spring Boot application was assigned a **System-Assigned Managed Identity**. This identity acts as a secure, invisible service account. The Key Vault was configured with an Access Policy (or RBAC rule) granting *only* this specific App Service the permission to "Get" secrets. Consequently, the application dynamically retrieves secrets into memory at runtime, without requiring a master password to access the vault.

> **[📸 INSERT IMAGE HERE: Screenshot of your Azure Key Vault showing the list of stored secrets (e.g., secreteJwtString)]**

> **[📸 INSERT IMAGE HERE: Screenshot of the "Identity" blade in your Azure App Service showing the System-Assigned identity turned ON]**

---

## 6. Implementation Phase 2: Network Isolation & Database Security <a name="phase-2"></a>
Securing the data at rest and in transit is a core component of Security Engineering. By default, PaaS databases can have public endpoints, which exposes them to brute-force attacks and zero-day vulnerabilities.

To mitigate this, **Network Security Groups (NSGs)** and **Azure Virtual Networks (VNets)** were implemented.

1.  **VNet Integration:** The App Service was integrated into a dedicated Azure VNet subnet.
2.  **Private Endpoints/Firewall Rules:** The Azure Database for PostgreSQL was configured to reject all public internet traffic. Its firewall was strictly configured to only accept incoming connections from the specific VNet subnet where the Spring Boot application resides.
3.  **Encryption:** Encryption at rest was enforced on the database layer using Azure's default encryption algorithms (AES-256).

This ensures that even if an attacker discovers the exact URL and credentials of the database, they cannot establish a connection unless they have already breached the internal Azure network.

> **[📸 INSERT IMAGE HERE: Screenshot of the Azure Database for PostgreSQL "Networking" or "Connection Security" tab showing public access denied / firewall rules allowing only internal VNet traffic]**

---

## 7. Implementation Phase 3: Edge Protection & Web Application Firewall (WAF) <a name="phase-3"></a>
While the backend and network were secured, the public-facing API endpoints (such as the checkout or login endpoints) remained vulnerable to Layer 7 (Application Layer) attacks.

To defend against OWASP Top 10 vulnerabilities, **Azure Application Gateway** with an integrated **Web Application Firewall (WAF)** was deployed.

* **Traffic Routing:** All public DNS records were pointed to the Application Gateway, acting as a reverse proxy. The direct URL of the App Service was hidden.
* **WAF Policies:** The WAF was configured in "Prevention" mode using the OWASP Core Rule Set (CRS). This automatically inspects incoming HTTP/HTTPS requests for malicious patterns.
* **Protection Applied:** If a user attempts to input malicious SQL syntax in the `checkout.tip` field, or attempts a directory traversal attack, the WAF immediately intercepts and drops the request before it ever reaches the Spring Boot application.

> **[📸 INSERT IMAGE HERE: Screenshot of the Azure Application Gateway / WAF configuration, or WAF metrics showing blocked requests if you have them]**

---

## 8. Conclusion <a name="conclusion"></a>
Through this project, the "FoodApp" architecture was successfully transformed from a highly vulnerable local deployment to a secure, enterprise-ready cloud application.

By applying the principles learned in the Security Engineering course, multiple layers of defense were established. Azure Key Vault eliminated hardcoded credential vulnerabilities; Virtual Networks and NSGs eliminated public database exposure; and the implementation of a WAF ensured that the application is resilient against common web exploits. This multi-layered approach successfully demonstrates the practical execution of a Zero-Trust Cloud Architecture.

---
*End of Report*