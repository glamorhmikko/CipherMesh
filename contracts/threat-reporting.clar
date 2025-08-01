;; ------------------------------
;; Admin Setup
;; ------------------------------
(define-data-var admin principal tx-sender)

;; ------------------------------
;; Threat Map Schema
;; ------------------------------
(define-map threats
  uint
  {
    reporter: principal,
    target: principal,
    description: (string-ascii 256),
    severity: uint,
    status: (string-ascii 32),
    stake: uint
  }
)

(define-data-var threat-counter uint u0)

;; ------------------------------
;; Supporting Maps
;; ------------------------------
(define-map validator-nodes principal bool)
(define-map slashed-reporters principal uint)
(define-map reporter-reputation principal int)

;; ------------------------------
;; Constants
;; ------------------------------
(define-constant MINIMUM-STAKE u10000)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-STAKE u101)
(define-constant ERR-THREAT-NOT-FOUND u102)
(define-constant ERR-NOT-VALIDATOR u103)
(define-constant ERR-ALREADY-VALIDATED u104)

;; ------------------------------
;; Private Helpers
;; ------------------------------
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; ------------------------------
;; Public Functions
;; ------------------------------

(define-public (submit-threat
  (target principal)
  (description (string-ascii 256))
  (severity uint)
)
  (let (
    (current-id (var-get threat-counter))
    (new-id (+ current-id u1))
  )
    (begin
      (asserts! (>= (stx-get-balance tx-sender) MINIMUM-STAKE) (err ERR-INVALID-STAKE))
      (stx-burn MINIMUM-STAKE)
      (map-set threats new-id {
        reporter: tx-sender,
        target: target,
        description: description,
        severity: severity,
        status: "pending",
        stake: MINIMUM-STAKE
      })
      (var-set threat-counter new-id)
      (ok new-id)
    )
  )
)

(define-public (validate-threat (id uint) (verdict bool))
  (begin
    (asserts! (is-eq (default-to false (map-get? validator-nodes tx-sender)) true) (err ERR-NOT-VALIDATOR))
    (match (map-get? threats id)
      threat
      (let (
        (reporter (get reporter threat))
        (status (get status threat))
        (target (get target threat))
        (description (get description threat))
        (severity (get severity threat))
        (stake (get stake threat))
      )
        (begin
          (asserts! (is-eq status "pending") (err ERR-ALREADY-VALIDATED))
          (map-set threats id {
            reporter: reporter,
            target: target,
            description: description,
            severity: severity,
            status: (if verdict "valid" "invalid"),
            stake: stake
          })
          (if verdict
            (begin
              (map-set reporter-reputation reporter
                (+ (default-to 0 (map-get? reporter-reputation reporter)) 1))
              (stx-transfer? MINIMUM-STAKE tx-sender reporter)
            )
            (begin
              (map-set slashed-reporters reporter
                (+ (default-to u0 (map-get? slashed-reporters reporter)) u1))
            )
          )
          (ok true)
        )
      )
      (err ERR-THREAT-NOT-FOUND)
    )
  )
)

(define-public (add-validator (validator principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-set validator-nodes validator true)
    (ok true)
  )
)

(define-public (remove-validator (validator principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-delete validator-nodes validator)
    (ok true)
  )
)

(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

;; ------------------------------
;; Read-only Functions
;; ------------------------------

(define-read-only (get-threat (id uint))
  (match (map-get? threats id)
    some-threat (ok some-threat)
    none (err ERR-THREAT-NOT-FOUND)
  )
)

(define-read-only (get-reputation (reporter principal))
  (ok (default-to 0 (map-get? reporter-reputation reporter)))
)

(define-read-only (get-slashed-count (reporter principal))
  (ok (default-to u0 (map-get? slashed-reporters reporter)))
)

(define-read-only (is-validator (address principal))
  (ok (default-to false (map-get? validator-nodes address)))
)

(define-read-only (get-threat-counter)
  (ok (var-get threat-counter))
)
